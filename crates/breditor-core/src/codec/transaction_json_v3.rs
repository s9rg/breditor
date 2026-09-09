//! Strict property-preserving transaction-request JSON codec.

use std::borrow::Cow;

use serde::{Deserialize, Serialize, de::IgnoredAny, ser::SerializeStruct};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, JsonFailure, TransactionRecordError, TransactionRecordErrorCode,
        TransactionRecordLocation, TransactionV3CodecError,
    },
    identity::QualifiedName,
    record::{
        PendingFormatsUpdateRecordV2, SelectionRelocationRecordV1, SelectionUpdateRecordV1,
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
    editor_value_preflight_v2::preflight_pending_format_records_v2,
    json_size::JsonByteCounter,
    operation_preflight::preflight_operation_payload,
    operation_sequence_v1::{
        IndexedOperationValidationError, OperationSequenceLimitError,
        validate_operation_sequence_count,
    },
    operation_sequence_v2::{
        OperationSequenceDecodeErrorV2, OperationSequenceEncodingV2, decode_operation_sequence_v2,
        preflight_operation_sequence_v2,
    },
    schema_binding_encoding::SchemaBindingEncoding,
    transaction_payload_v1::{
        decode_selection_relocation_v1, decode_selection_update_v1, decode_transaction_metadata_v1,
        encode_selection_relocation_v1, encode_selection_update_v1, encode_transaction_metadata_v1,
    },
    transaction_payload_v2::{decode_pending_formats_update_v2, encode_pending_formats_update_v2},
};

/// Wire version implemented by [`TransactionJsonCodecV3`].
pub const TRANSACTION_REQUEST_V3_FORMAT_VERSION: u32 = 3;

/// Strict JSON codec for one fingerprint-bound, property-preserving V3 request.
///
/// V3 keeps the V2 envelope, base snapshot, selection, and metadata contracts.
/// Its primitive operations and pending-format update advance together to their
/// property-preserving record generation. No mixed operation generation is
/// accepted or emitted.
#[derive(Clone, Debug)]
pub struct TransactionJsonCodecV3 {
    context: EditorContext,
}

impl TransactionJsonCodecV3 {
    /// Creates a V3 transaction-request codec bound to one immutable context.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the context used for binding, limits, and operation validation.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one V3 request against the supplied complete base state.
    ///
    /// Property-bearing payloads are allocation-preflighted and canonicality-
    /// checked before any owned record deserialization. The supplied base must
    /// use this codec's exact process-local context.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionV3CodecError`] for context misuse, an oversized or
    /// malformed record, a non-V3 envelope, binding or snapshot mismatch,
    /// resource limits, or checked reconstruction failure.
    pub fn decode(
        &self,
        json: &str,
        base: &EditorState,
    ) -> Result<Transaction, TransactionV3CodecError> {
        if base.context() != &self.context {
            return Err(TransactionV3CodecError::ContextConfigurationMismatch);
        }
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(TransactionV3CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedTransactionHeaderV3<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV3CodecError::InvalidJson)?;
        if header.format != super::transaction_json::TRANSACTION_REQUEST_FORMAT {
            return Err(TransactionV3CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: super::transaction_json::TRANSACTION_REQUEST_FORMAT,
            });
        }
        if header.format_version != TRANSACTION_REQUEST_V3_FORMAT_VERSION {
            return Err(TransactionV3CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: TRANSACTION_REQUEST_V3_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedTransactionRequestV3<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV3CodecError::InvalidJson)?;
        let schema = schema_id_from_raw(envelope.schema)?;
        require_schema_id(self.context.schema(), &schema)?;
        let fingerprint = envelope
            .schema_fingerprint
            .parse::<SchemaFingerprint>()
            .map_err(TransactionV3CodecError::InvalidSchemaFingerprint)?;
        require_schema_fingerprint(self.context.schema(), fingerprint)?;

        let snapshot = snapshot_id_from_raw(envelope.base_snapshot)?;
        if &snapshot != base.snapshot() {
            return Err(TransactionV3CodecError::BaseSnapshotMismatch {
                expected: base.snapshot().clone(),
                found: snapshot,
            });
        }

        let operation_preflight =
            preflight_operation_sequence_v2(envelope.operations.get(), &self.context)
                .map_err(transaction_operation_sequence_error)?;
        let operations = decode_operation_sequence_v2(
            envelope.operations.get(),
            &self.context,
            operation_preflight,
        )
        .map_err(transaction_operation_sequence_error)?;

        for payload in [envelope.selection_relocation, envelope.selection_update, envelope.metadata]
        {
            preflight_operation_payload(payload.get(), &self.context)
                .map_err(|error| JsonFailure::from_serde(&error))
                .map_err(TransactionV3CodecError::InvalidJson)?;
        }
        preflight_pending_formats_update_v3(envelope.pending_formats_update, &self.context)?;

        let selection_relocation: SelectionRelocationRecordV1 =
            decode_raw_record(envelope.selection_relocation)?;
        let selection_update: SelectionUpdateRecordV1 =
            decode_raw_record(envelope.selection_update)?;
        let pending_formats_update: PendingFormatsUpdateRecordV2 =
            decode_raw_record(envelope.pending_formats_update)?;
        let metadata: TransactionMetadataRecordV1 = decode_raw_record(envelope.metadata)?;

        Ok(Transaction::from_parts(
            base.clone(),
            operations,
            decode_selection_relocation_v1(selection_relocation),
            decode_selection_update_v1(selection_update)?,
            decode_pending_formats_update_v2(pending_formats_update, &self.context)?,
            decode_transaction_metadata_v1(metadata)?,
        ))
    }

    /// Encodes one context-valid request into deterministic compact V3 JSON.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionV3CodecError`] when contexts differ, a semantic
    /// resource limit or payload validation fails, serialization fails, or the
    /// result exceeds the same codec's input-byte budget.
    pub fn encode(&self, transaction: &Transaction) -> Result<String, TransactionV3CodecError> {
        if transaction.base_state().context() != &self.context {
            return Err(TransactionV3CodecError::ContextConfigurationMismatch);
        }
        validate_operation_sequence_count(transaction.operations(), &self.context)
            .map_err(transaction_operation_limit_error)?;

        let binding = self.context.schema().durable_binding();
        let record = TransactionRequestRecordV3 {
            binding,
            base_snapshot: encode_snapshot_id_v1(transaction.base_snapshot()),
            operations: OperationSequenceEncodingV2::new(transaction.operations(), &self.context),
            selection_relocation: encode_selection_relocation_v1(
                transaction.selection_relocation(),
            ),
            selection_update: encode_selection_update_v1(transaction.selection_update()),
            pending_formats_update: encode_pending_formats_update_v2(
                transaction.pending_formats_update(),
                &self.context,
            )?,
            metadata: encode_transaction_metadata_v1(transaction.metadata()),
        };
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(TransactionV3CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        if let Some(error) = record.operations.take_validation_error() {
            return Err(transaction_operation_validation_error(error));
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV3CodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV3CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedTransactionHeaderV3<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedTransactionRequestV3<'a> {
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

struct TransactionRequestRecordV3<Operations> {
    binding: DurableSchemaBinding,
    base_snapshot: SnapshotIdRecordV1,
    operations: Operations,
    selection_relocation: SelectionRelocationRecordV1,
    selection_update: SelectionUpdateRecordV1,
    pending_formats_update: PendingFormatsUpdateRecordV2,
    metadata: TransactionMetadataRecordV1,
}

impl<Operations> Serialize for TransactionRequestRecordV3<Operations>
where
    Operations: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("TransactionRequestRecordV3", 10)?;
        record.serialize_field("format", super::transaction_json::TRANSACTION_REQUEST_FORMAT)?;
        record.serialize_field("formatVersion", &TRANSACTION_REQUEST_V3_FORMAT_VERSION)?;
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
struct BorrowedSchemaIdRecordV3<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSnapshotIdRecordV3<'a> {
    #[serde(borrow)]
    lineage: Cow<'a, str>,
    #[serde(borrow)]
    revision: Cow<'a, str>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedPendingFormatsUpdatePreflightV3<'a> {
    #[serde(rename = "kind")]
    _kind: IgnoredAny,
    #[serde(default, borrow)]
    formats: Option<&'a RawValue>,
}

fn preflight_pending_formats_update_v3(
    raw: &RawValue,
    context: &EditorContext,
) -> Result<(), TransactionV3CodecError> {
    let record: BorrowedPendingFormatsUpdatePreflightV3<'_> = decode_raw_record(raw)?;
    if let Some(formats) = record.formats {
        preflight_pending_format_records_v2(formats.get(), context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV3CodecError::InvalidJson)?;
    }
    Ok(())
}

fn schema_id_from_raw(raw: &RawValue) -> Result<SchemaId, TransactionV3CodecError> {
    let record: BorrowedSchemaIdRecordV3<'_> = decode_raw_record(raw)?;
    let name = QualifiedName::try_new(record.name.as_ref()).map_err(|source| {
        TransactionV3CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(record.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        TransactionV3CodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn snapshot_id_from_raw(raw: &RawValue) -> Result<SnapshotId, TransactionV3CodecError> {
    let record: BorrowedSnapshotIdRecordV3<'_> = decode_raw_record(raw)?;
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

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, TransactionV3CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(TransactionV3CodecError::InvalidJson)
}

fn transaction_operation_sequence_error(
    error: OperationSequenceDecodeErrorV2,
) -> TransactionV3CodecError {
    match error {
        OperationSequenceDecodeErrorV2::Json(source) => {
            TransactionV3CodecError::InvalidJson(source)
        }
        OperationSequenceDecodeErrorV2::Limit(error) => transaction_operation_limit_error(error),
        OperationSequenceDecodeErrorV2::OperationJson { operation_index, source } => {
            TransactionV3CodecError::InvalidOperationJson { operation_index, source }
        }
        OperationSequenceDecodeErrorV2::OperationRecord { operation_index, source } => {
            TransactionV3CodecError::InvalidOperation { operation_index, source }
        }
        OperationSequenceDecodeErrorV2::OperationValidation(error) => {
            transaction_operation_validation_error(error)
        }
    }
}

const fn transaction_operation_limit_error(
    error: OperationSequenceLimitError,
) -> TransactionV3CodecError {
    TransactionV3CodecError::OperationLimit { actual: error.actual, maximum: error.maximum }
}

fn transaction_operation_validation_error(
    error: IndexedOperationValidationError,
) -> TransactionV3CodecError {
    TransactionV3CodecError::OperationValidation {
        operation_index: error.operation_index,
        source: error.source,
    }
}
