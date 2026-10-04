//! Strict property-preserving transaction-request JSON codec.

use std::borrow::Cow;

use serde::{Deserialize, Serialize, de::IgnoredAny, ser::SerializeStruct};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, JsonFailure, TransactionRecordError, TransactionRecordErrorCode,
        TransactionRecordLocation, TransactionV6CodecError,
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
    operation_sequence_v1::{OperationSequenceLimitError, validate_operation_sequence_count},
    operation_sequence_v5::{
        IndexedOperationCodecErrorV6, OperationSequenceEncodingV5, OperationSequenceErrorV5,
        count_operation_sequence_v5, decode_operation_sequence_v5,
    },
    schema_binding_encoding::SchemaBindingEncoding,
    transaction_payload_v1::{
        decode_selection_relocation_v1, decode_selection_update_v1, decode_transaction_metadata_v1,
        encode_selection_relocation_v1, encode_selection_update_v1, encode_transaction_metadata_v1,
    },
    transaction_payload_v2::{decode_pending_formats_update_v2, encode_pending_formats_update_v2},
};

/// Wire version implemented by [`TransactionJsonCodecV6`].
pub const TRANSACTION_REQUEST_V6_FORMAT_VERSION: u32 = 6;

/// Strict JSON codec for one fingerprint-bound, property-preserving V6 request.
///
/// V6 keeps V3's snapshot, selection, pending-format and metadata contracts,
/// and explicitly admits guarded flat-list edits as well as heading edits. Decode
/// checks static validity; apply still proves live guards and atomic results.
/// Complete retained history uses the separate V6 session checkpoint codec.
#[derive(Clone, Debug)]
pub struct TransactionJsonCodecV6 {
    context: EditorContext,
}

impl TransactionJsonCodecV6 {
    /// Creates a V6 transaction-request codec bound to one immutable context.
    #[must_use]
    pub const fn new(context: EditorContext) -> Self {
        Self { context }
    }

    /// Returns the context used for binding, limits, and operation validation.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one V6 request against the supplied complete base state.
    ///
    /// Each property-bearing payload is allocation-preflighted and canonicality-
    /// checked before its owned reconstruction. Array count is checked before
    /// any operation is materialized. The supplied base must use this codec's
    /// exact process-local context.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionV6CodecError`] for context misuse, an oversized or
    /// malformed record, a non-V6 envelope, binding or snapshot mismatch,
    /// resource limits, or checked reconstruction failure.
    pub fn decode(
        &self,
        json: &str,
        base: &EditorState,
    ) -> Result<Transaction, TransactionV6CodecError> {
        if base.context() != &self.context {
            return Err(TransactionV6CodecError::ContextConfigurationMismatch);
        }
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(TransactionV6CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedTransactionHeaderV6<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV6CodecError::InvalidJson)?;
        if header.format != super::transaction_json::TRANSACTION_REQUEST_FORMAT {
            return Err(TransactionV6CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: super::transaction_json::TRANSACTION_REQUEST_FORMAT,
            });
        }
        if header.format_version != TRANSACTION_REQUEST_V6_FORMAT_VERSION {
            return Err(TransactionV6CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: TRANSACTION_REQUEST_V6_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedTransactionRequestV6<'_> = serde_json::from_str(json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV6CodecError::InvalidJson)?;
        let schema = schema_id_from_raw(envelope.schema)?;
        require_schema_id(self.context.schema(), &schema)?;
        let fingerprint = envelope
            .schema_fingerprint
            .parse::<SchemaFingerprint>()
            .map_err(TransactionV6CodecError::InvalidSchemaFingerprint)?;
        require_schema_fingerprint(self.context.schema(), fingerprint)?;

        let snapshot = snapshot_id_from_raw(envelope.base_snapshot)?;
        if &snapshot != base.snapshot() {
            return Err(TransactionV6CodecError::BaseSnapshotMismatch {
                expected: base.snapshot().clone(),
                found: snapshot,
            });
        }

        let operation_preflight = count_operation_sequence_v5(
            envelope.operations.get(),
            self.context.max_operations_per_transaction(),
        )
        .map_err(transaction_operation_sequence_error)?;
        let operations = decode_operation_sequence_v5(
            envelope.operations.get(),
            &self.context,
            operation_preflight,
        )
        .map_err(transaction_operation_sequence_error)?;

        for payload in [envelope.selection_relocation, envelope.selection_update, envelope.metadata]
        {
            preflight_operation_payload(payload.get(), &self.context)
                .map_err(|error| JsonFailure::from_serde(&error))
                .map_err(TransactionV6CodecError::InvalidJson)?;
        }
        preflight_pending_formats_update_v6(envelope.pending_formats_update, &self.context)?;

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

    /// Encodes one context-valid request into deterministic compact V6 JSON.
    ///
    /// # Errors
    ///
    /// Returns [`TransactionV6CodecError`] when contexts differ, a semantic
    /// resource limit or payload validation fails, serialization fails, or the
    /// result exceeds the same codec's input-byte budget.
    pub fn encode(&self, transaction: &Transaction) -> Result<String, TransactionV6CodecError> {
        if transaction.base_state().context() != &self.context {
            return Err(TransactionV6CodecError::ContextConfigurationMismatch);
        }
        validate_operation_sequence_count(transaction.operations(), &self.context)
            .map_err(transaction_operation_limit_error)?;

        let binding = self.context.schema().durable_binding();
        let record = TransactionRequestRecordV6 {
            binding,
            base_snapshot: encode_snapshot_id_v1(transaction.base_snapshot()),
            operations: OperationSequenceEncodingV5::new(transaction.operations(), &self.context),
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
            return Err(TransactionV6CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        if let Some(error) = record.operations.take_error() {
            return Err(transaction_operation_payload_error(error));
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV6CodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV6CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedTransactionHeaderV6<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedTransactionRequestV6<'a> {
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

struct TransactionRequestRecordV6<Operations> {
    binding: DurableSchemaBinding,
    base_snapshot: SnapshotIdRecordV1,
    operations: Operations,
    selection_relocation: SelectionRelocationRecordV1,
    selection_update: SelectionUpdateRecordV1,
    pending_formats_update: PendingFormatsUpdateRecordV2,
    metadata: TransactionMetadataRecordV1,
}

impl<Operations> Serialize for TransactionRequestRecordV6<Operations>
where
    Operations: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("TransactionRequestRecordV6", 10)?;
        record.serialize_field("format", super::transaction_json::TRANSACTION_REQUEST_FORMAT)?;
        record.serialize_field("formatVersion", &TRANSACTION_REQUEST_V6_FORMAT_VERSION)?;
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
struct BorrowedSchemaIdRecordV6<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSnapshotIdRecordV6<'a> {
    #[serde(borrow)]
    lineage: Cow<'a, str>,
    #[serde(borrow)]
    revision: Cow<'a, str>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedPendingFormatsUpdatePreflightV6<'a> {
    #[serde(rename = "kind")]
    _kind: IgnoredAny,
    #[serde(default, borrow)]
    formats: Option<&'a RawValue>,
}

fn preflight_pending_formats_update_v6(
    raw: &RawValue,
    context: &EditorContext,
) -> Result<(), TransactionV6CodecError> {
    let record: BorrowedPendingFormatsUpdatePreflightV6<'_> = decode_raw_record(raw)?;
    if let Some(formats) = record.formats {
        preflight_pending_format_records_v2(formats.get(), context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(TransactionV6CodecError::InvalidJson)?;
    }
    Ok(())
}

fn schema_id_from_raw(raw: &RawValue) -> Result<SchemaId, TransactionV6CodecError> {
    let record: BorrowedSchemaIdRecordV6<'_> = decode_raw_record(raw)?;
    let name = QualifiedName::try_new(record.name.as_ref()).map_err(|source| {
        TransactionV6CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(record.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(record.version).map_err(|source| {
        TransactionV6CodecError::InvalidSchemaVersion { value: record.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn snapshot_id_from_raw(raw: &RawValue) -> Result<SnapshotId, TransactionV6CodecError> {
    let record: BorrowedSnapshotIdRecordV6<'_> = decode_raw_record(raw)?;
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

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, TransactionV6CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(TransactionV6CodecError::InvalidJson)
}

fn transaction_operation_sequence_error(
    error: OperationSequenceErrorV5,
) -> TransactionV6CodecError {
    match error {
        OperationSequenceErrorV5::Json(source) => TransactionV6CodecError::InvalidJson(source),
        OperationSequenceErrorV5::Limit(error) => transaction_operation_limit_error(error),
        OperationSequenceErrorV5::Payload(error) => transaction_operation_payload_error(error),
    }
}

const fn transaction_operation_limit_error(
    error: OperationSequenceLimitError,
) -> TransactionV6CodecError {
    TransactionV6CodecError::OperationLimit { actual: error.actual, maximum: error.maximum }
}

fn transaction_operation_payload_error(
    error: IndexedOperationCodecErrorV6,
) -> TransactionV6CodecError {
    TransactionV6CodecError::OperationPayload {
        operation_index: error.operation_index,
        source: error.source,
    }
}
