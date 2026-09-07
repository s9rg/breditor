use std::borrow::Cow;

use serde::{Deserialize, Serialize, de::IgnoredAny, ser::SerializeStruct};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, JsonFailure, TransactionRecordError, TransactionRecordErrorCode,
        TransactionRecordLocation, TransactionV2CodecError,
    },
    identity::QualifiedName,
    record::{
        PendingFormatsUpdateRecordV1, SelectionRelocationRecordV1, SelectionUpdateRecordV1,
        SnapshotIdRecordV1, TransactionMetadataRecordV1,
    },
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion,
        require_schema_fingerprint, require_schema_id,
    },
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
    schema_binding_encoding::SchemaBindingEncoding,
    transaction_payload_v1::{
        decode_pending_formats_update_v1, decode_selection_relocation_v1,
        decode_selection_update_v1, decode_transaction_metadata_v1,
        encode_pending_formats_update_v1, encode_selection_relocation_v1,
        encode_selection_update_v1, encode_transaction_metadata_v1,
    },
};

/// Wire version implemented by [`TransactionJsonCodecV2`].
pub const TRANSACTION_REQUEST_V2_FORMAT_VERSION: u32 = 2;

/// Strict JSON codec for one fingerprint-bound V2 transaction request.
///
/// The V2 outer envelope is independent from V1 and adds a complete durable
/// schema binding. Snapshot, selection, metadata, and closed primitive
/// operation payload records are deliberately reused unchanged. No mixed V1/V2
/// envelope is accepted or emitted.
#[derive(Clone, Debug)]
pub struct TransactionJsonCodecV2 {
    context: EditorContext,
}

impl TransactionJsonCodecV2 {
    /// Creates a V2 transaction-request codec bound to one immutable context.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the context used for binding, limits, and operation validation.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one V2 request against the supplied complete base state.
    ///
    /// The base is a runtime capability, not a wire document, and must use this
    /// codec's exact process-local context. The envelope's selector and
    /// fingerprint are checked before its snapshot and primitive payloads.
    /// Hosts must still authorize untrusted history metadata before application.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionV2CodecError`] for context misuse, an oversized or
    /// malformed record, a non-V2 envelope, invalid fingerprint text, durable
    /// binding or base mismatch, a semantic resource limit, or checked
    /// reconstruction failure.
    pub fn decode(
        &self,
        json: &str,
        base: &EditorState,
    ) -> Result<Transaction, TransactionV2CodecError> {
        if base.context() != &self.context {
            return Err(TransactionV2CodecError::ContextConfigurationMismatch);
        }
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(TransactionV2CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedTransactionHeaderV2<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV2CodecError::InvalidJson)?;
        if header.format != super::transaction_json::TRANSACTION_REQUEST_FORMAT {
            return Err(TransactionV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: super::transaction_json::TRANSACTION_REQUEST_FORMAT,
            });
        }
        if header.format_version != TRANSACTION_REQUEST_V2_FORMAT_VERSION {
            return Err(TransactionV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: TRANSACTION_REQUEST_V2_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedTransactionRequestV2<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV2CodecError::InvalidJson)?;
        let schema = schema_id_from_raw(envelope.schema)?;
        require_schema_id(self.context.schema(), &schema)?;
        let fingerprint = envelope
            .schema_fingerprint
            .parse::<SchemaFingerprint>()
            .map_err(TransactionV2CodecError::InvalidSchemaFingerprint)?;
        require_schema_fingerprint(self.context.schema(), fingerprint)?;

        let snapshot = snapshot_id_from_raw(envelope.base_snapshot)?;
        if &snapshot != base.snapshot() {
            return Err(TransactionV2CodecError::BaseSnapshotMismatch {
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
                .map_err(TransactionV2CodecError::InvalidJson)?;
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

    /// Encodes one context-valid request into deterministic compact V2 JSON.
    ///
    /// This method always emits V2, including for the built-in base schema and
    /// for a request with no primitive operations.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionV2CodecError`] when the base context differs, a
    /// semantic resource limit or payload validation fails, serialization
    /// fails, or the result exceeds the same codec's input-byte budget.
    pub fn encode(&self, transaction: &Transaction) -> Result<String, TransactionV2CodecError> {
        if transaction.base_state().context() != &self.context {
            return Err(TransactionV2CodecError::ContextConfigurationMismatch);
        }
        validate_operation_sequence_count(transaction.operations(), &self.context)
            .map_err(transaction_operation_limit_error)?;

        let binding = self.context.schema().durable_binding();
        let record = TransactionRequestRecordV2 {
            binding,
            base_snapshot: encode_snapshot_id_v1(transaction.base_snapshot()),
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
            return Err(TransactionV2CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        if let Some(error) = record.operations.take_validation_error() {
            return Err(transaction_operation_validation_error(error));
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV2CodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV2CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedTransactionHeaderV2<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedTransactionRequestV2<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: &'a RawValue,
    #[serde(borrow)]
    schema_fingerprint: Cow<'a, str>,
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

struct TransactionRequestRecordV2<Operations> {
    binding: DurableSchemaBinding,
    base_snapshot: SnapshotIdRecordV1,
    operations: Operations,
    selection_relocation: SelectionRelocationRecordV1,
    selection_update: SelectionUpdateRecordV1,
    pending_formats_update: PendingFormatsUpdateRecordV1,
    metadata: TransactionMetadataRecordV1,
}

impl<Operations> Serialize for TransactionRequestRecordV2<Operations>
where
    Operations: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("TransactionRequestRecordV2", 10)?;
        record.serialize_field("format", super::transaction_json::TRANSACTION_REQUEST_FORMAT)?;
        record.serialize_field("formatVersion", &TRANSACTION_REQUEST_V2_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.binding.schema(), self.binding.fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("baseSnapshot", &self.base_snapshot)?;
        record.serialize_field("operations", &self.operations)?;
        record.serialize_field("selectionRelocation", &self.selection_relocation)?;
        record.serialize_field("selectionUpdate", &self.selection_update)?;
        record.serialize_field("pendingFormatsUpdate", &self.pending_formats_update)?;
        record.serialize_field("metadata", &self.metadata)?;
        record.end()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSchemaIdRecordV2<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSnapshotIdRecordV2<'a> {
    #[serde(borrow)]
    lineage: Cow<'a, str>,
    #[serde(borrow)]
    revision: Cow<'a, str>,
}

fn schema_id_from_raw(raw: &RawValue) -> Result<SchemaId, TransactionV2CodecError> {
    let record: BorrowedSchemaIdRecordV2<'_> = decode_raw_record(raw)?;
    let name = QualifiedName::try_new(record.name.as_ref()).map_err(|source| {
        TransactionV2CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(record.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        TransactionV2CodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn snapshot_id_from_raw(raw: &RawValue) -> Result<SnapshotId, TransactionV2CodecError> {
    let record: BorrowedSnapshotIdRecordV2<'_> = decode_raw_record(raw)?;
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

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, TransactionV2CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(TransactionV2CodecError::InvalidJson)
}

fn transaction_operation_sequence_error(
    error: OperationSequenceDecodeError,
) -> TransactionV2CodecError {
    match error {
        OperationSequenceDecodeError::Json(source) => TransactionV2CodecError::InvalidJson(source),
        OperationSequenceDecodeError::Limit(error) => transaction_operation_limit_error(error),
        OperationSequenceDecodeError::OperationJson { operation_index, source } => {
            TransactionV2CodecError::InvalidOperationJson { operation_index, source }
        }
        OperationSequenceDecodeError::OperationRecord { operation_index, source } => {
            TransactionV2CodecError::InvalidOperation { operation_index, source }
        }
        OperationSequenceDecodeError::OperationValidation(error) => {
            transaction_operation_validation_error(error)
        }
    }
}

const fn transaction_operation_limit_error(
    error: OperationSequenceLimitError,
) -> TransactionV2CodecError {
    TransactionV2CodecError::OperationLimit { actual: error.actual, maximum: error.maximum }
}

fn transaction_operation_validation_error(
    error: IndexedOperationValidationError,
) -> TransactionV2CodecError {
    TransactionV2CodecError::OperationValidation {
        operation_index: error.operation_index,
        source: error.source,
    }
}
