use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, JsonFailure, TransactionCodecError, TransactionRecordError,
        TransactionRecordErrorCode, TransactionRecordLocation,
    },
    identity::QualifiedName,
    record::{
        PendingFormatsUpdateRecordV1, SchemaIdRecord, SelectionRelocationRecordV1,
        SelectionUpdateRecordV1, TRANSACTION_REQUEST_FORMAT as RECORD_FORMAT,
        TRANSACTION_REQUEST_FORMAT_VERSION as RECORD_FORMAT_VERSION, TransactionMetadataRecordV1,
        TransactionRequestRecordV1,
    },
    schema::{SchemaId, SchemaVersion},
    state::{EditorContext, EditorState, SnapshotId},
    transaction::Transaction,
};

use super::{
    editor_value_payload_v1::{
        SnapshotValueRecordError, decode_snapshot_id_v1, encode_snapshot_id_v1,
    },
    json_size::JsonByteCounter,
    operation_preflight::preflight_operation_payload,
    operation_sequence_v1::{
        IndexedOperationValidationError, OperationSequenceDecodeError, OperationSequenceEncoding,
        OperationSequenceLimitError, decode_operation_sequence, preflight_operation_sequence,
        validate_operation_sequence_count,
    },
    transaction_payload_v1::{
        decode_pending_formats_update_v1, decode_selection_relocation_v1,
        decode_selection_update_v1, decode_transaction_metadata_v1,
        encode_pending_formats_update_v1, encode_selection_relocation_v1,
        encode_selection_update_v1, encode_transaction_metadata_v1,
    },
};

/// Stable identifier for Breditor's exact-base atomic request envelope.
pub const TRANSACTION_REQUEST_FORMAT: &str = RECORD_FORMAT;

/// Transaction-request wire version implemented by this codec.
pub const TRANSACTION_REQUEST_FORMAT_VERSION: u32 = RECORD_FORMAT_VERSION;

/// Strict JSON codec for an atomic transaction request bound to one context.
///
/// Decode requires the complete immutable base state because the wire snapshot
/// is an identity reference, not a document copy or content hash. The codec
/// reconstructs a request but never applies it. Atomic replay remains the job
/// of [`Transaction::apply`] or [`crate::session::EditorSession`].
#[derive(Clone, Debug)]
pub struct TransactionJsonCodec {
    context: EditorContext,
}

impl TransactionJsonCodec {
    /// Creates a transaction-request codec bound to one immutable context.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the schema, limits, and operation ceiling used by this codec.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one request against the supplied complete base state.
    ///
    /// The honest round-trip law is
    /// `decode(encode(transaction), transaction.base_state()) == transaction`.
    /// Explicit result selections are structurally reconstructed here but are
    /// resolved against the result document only during atomic application.
    /// A host decoding untrusted requests must authorize or sanitize metadata:
    /// `HistoryIntent::Ignore` can clear both live history branches after a
    /// content commit, and `HistoryIntent::Merge` changes grouping behavior.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionCodecError`] for context misuse, an oversized or
    /// malformed record, unsupported format, schema/base mismatch, an operation
    /// limit, or failed checked reconstruction. JSON locations for nested raw
    /// payloads are local to the named payload rather than the outer envelope.
    pub fn decode(
        &self,
        json: &str,
        base: &EditorState,
    ) -> Result<Transaction, TransactionCodecError> {
        if base.context() != &self.context {
            return Err(TransactionCodecError::ContextConfigurationMismatch);
        }
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(TransactionCodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedTransactionHeader<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionCodecError::InvalidJson)?;
        if header.format != TRANSACTION_REQUEST_FORMAT {
            return Err(TransactionCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: TRANSACTION_REQUEST_FORMAT,
            });
        }
        if header.format_version != TRANSACTION_REQUEST_FORMAT_VERSION {
            return Err(TransactionCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: TRANSACTION_REQUEST_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedTransactionRequestV1<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionCodecError::InvalidJson)?;
        let schema = schema_id_from_raw(envelope.schema)?;
        if &schema != self.context.schema().id() {
            return Err(TransactionCodecError::SchemaMismatch {
                expected: self.context.schema().id().clone(),
                found: schema,
            });
        }

        let snapshot = snapshot_id_from_raw(envelope.base_snapshot)?;
        if &snapshot != base.snapshot() {
            return Err(TransactionCodecError::BaseSnapshotMismatch {
                expected: base.snapshot().clone(),
                found: snapshot,
            });
        }

        let operation_preflight =
            preflight_operation_sequence(envelope.operations.get(), &self.context)
                .map_err(transaction_operation_sequence_error)?;
        let operations = decode_operation_sequence(
            envelope.operations.get(),
            &self.context,
            operation_preflight,
        )
        .map_err(transaction_operation_sequence_error)?;

        for payload in [
            envelope.selection_relocation,
            envelope.selection_update,
            envelope.pending_formats_update,
            envelope.metadata,
        ] {
            preflight_operation_payload(payload.get(), &self.context)
                .map_err(|error| JsonFailure::from_serde(&error))
                .map_err(TransactionCodecError::InvalidJson)?;
        }
        let selection_relocation: SelectionRelocationRecordV1 =
            decode_raw_record(envelope.selection_relocation)?;
        let selection_update: SelectionUpdateRecordV1 =
            decode_raw_record(envelope.selection_update)?;
        let pending_formats_update: PendingFormatsUpdateRecordV1 =
            decode_raw_record(envelope.pending_formats_update)?;
        let metadata: TransactionMetadataRecordV1 = decode_raw_record(envelope.metadata)?;

        Ok(Transaction::from_parts(
            base.clone(),
            operations,
            decode_selection_relocation_v1(selection_relocation),
            decode_selection_update_v1(selection_update)?,
            decode_pending_formats_update_v1(pending_formats_update, &self.context)?,
            decode_transaction_metadata_v1(metadata)?,
        ))
    }

    /// Encodes one context-valid request into deterministic compact JSON.
    ///
    /// This stable Rust V1 representation is not a canonical content hash,
    /// durable commit/log record, signature, or exactly-once transport. History
    /// intent is behavior requested from a live session and must be authorized
    /// by a host before decoding untrusted requests into that session.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionCodecError`] when the base context differs, the
    /// request exceeds a semantic limit, an operation/state field fails static
    /// validation, serialization fails, or the result exceeds the decode budget.
    pub fn encode(&self, transaction: &Transaction) -> Result<String, TransactionCodecError> {
        if transaction.base_state().context() != &self.context {
            return Err(TransactionCodecError::ContextConfigurationMismatch);
        }
        validate_operation_sequence_count(transaction.operations(), &self.context)
            .map_err(transaction_operation_limit_error)?;

        let schema = self.context.schema().id();
        let snapshot = transaction.base_snapshot();
        let record = TransactionRequestRecordV1 {
            format: TRANSACTION_REQUEST_FORMAT.to_owned(),
            format_version: TRANSACTION_REQUEST_FORMAT_VERSION,
            schema: SchemaIdRecord {
                name: schema.name().as_str().to_owned(),
                version: schema.version().get(),
            },
            base_snapshot: encode_snapshot_id_v1(snapshot),
            operations: OperationSequenceEncoding::new(transaction.operations(), &self.context),
            selection_relocation: encode_selection_relocation_v1(
                transaction.selection_relocation(),
            ),
            selection_update: encode_selection_update_v1(transaction.selection_update()),
            pending_formats_update: encode_pending_formats_update_v1(
                transaction.pending_formats_update(),
                &self.context,
            )?,
            metadata: encode_transaction_metadata_v1(transaction.metadata()),
        };
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(TransactionCodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        if let Some(error) = record.operations.take_validation_error() {
            return Err(transaction_operation_validation_error(error));
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionCodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionCodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedTransactionHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedTransactionRequestV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: &'a RawValue,
    #[serde(borrow)]
    base_snapshot: &'a RawValue,
    #[serde(borrow)]
    operations: &'a RawValue,
    #[serde(borrow)]
    selection_relocation: &'a RawValue,
    #[serde(borrow)]
    selection_update: &'a RawValue,
    #[serde(borrow)]
    pending_formats_update: &'a RawValue,
    #[serde(borrow)]
    metadata: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSchemaIdRecord<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSnapshotIdRecord<'a> {
    #[serde(borrow)]
    lineage: Cow<'a, str>,
    #[serde(borrow)]
    revision: Cow<'a, str>,
}

fn schema_id_from_raw(raw: &RawValue) -> Result<SchemaId, TransactionCodecError> {
    let record: BorrowedSchemaIdRecord<'_> = decode_raw_record(raw)?;
    let name = QualifiedName::try_new(record.name.as_ref()).map_err(|source| {
        TransactionCodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(record.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        TransactionCodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn snapshot_id_from_raw(raw: &RawValue) -> Result<SnapshotId, TransactionCodecError> {
    let record: BorrowedSnapshotIdRecord<'_> = decode_raw_record(raw)?;
    decode_snapshot_id_v1(record.lineage.as_ref(), record.revision.as_ref()).map_err(|error| {
        let (code, location) = match error {
            SnapshotValueRecordError::InvalidLineage(_) => (
                TransactionRecordErrorCode::InvalidBaseLineage,
                TransactionRecordLocation::BaseLineage,
            ),
            SnapshotValueRecordError::InvalidRevision(_) => (
                TransactionRecordErrorCode::InvalidBaseRevision,
                TransactionRecordLocation::BaseRevision,
            ),
        };
        TransactionRecordError::new(code, location, error.to_string()).into()
    })
}

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, TransactionCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(TransactionCodecError::InvalidJson)
}

fn transaction_operation_sequence_error(
    error: OperationSequenceDecodeError,
) -> TransactionCodecError {
    match error {
        OperationSequenceDecodeError::Json(source) => TransactionCodecError::InvalidJson(source),
        OperationSequenceDecodeError::Limit(error) => transaction_operation_limit_error(error),
        OperationSequenceDecodeError::OperationJson { operation_index, source } => {
            TransactionCodecError::InvalidOperationJson { operation_index, source }
        }
        OperationSequenceDecodeError::OperationRecord { operation_index, source } => {
            TransactionCodecError::InvalidOperation { operation_index, source }
        }
        OperationSequenceDecodeError::OperationValidation(error) => {
            transaction_operation_validation_error(error)
        }
    }
}

const fn transaction_operation_limit_error(
    error: OperationSequenceLimitError,
) -> TransactionCodecError {
    TransactionCodecError::OperationLimit { actual: error.actual, maximum: error.maximum }
}

fn transaction_operation_validation_error(
    error: IndexedOperationValidationError,
) -> TransactionCodecError {
    TransactionCodecError::OperationValidation {
        operation_index: error.operation_index,
        source: error.source,
    }
}
