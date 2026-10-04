//! Replay-proved durable commits for flat-list edits and typed inline formatting.

use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, CommitCodecError, CommitRecordError, CommitRecordErrorCode,
        CommitRecordLocation, JsonFailure,
    },
    identity::QualifiedName,
    operation::SelectionRelocationPolicy,
    record::{PendingFormatRecordV2, SelectionRecordV1, TransactionMetadataRecordV1},
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion,
        require_schema_fingerprint, require_schema_id,
    },
    state::EditorContext,
    transaction::{
        Commit, CommitCheckpointParts, PendingFormatsUpdate, SelectionUpdate, Transaction,
        TransactionOutcome,
    },
};

use super::{
    CommitV6CodecError,
    commit_encoding_v6::CommitEncodingV6,
    commit_json::{
        COMMIT_FORMAT, commit_operation_limit_error, commit_record_error_from_editor_value,
        decode_commit_metadata, first_operation_mismatch,
    },
    editor_state_encoding_v3::EditorStateEncodingV3,
    editor_state_json::EDITOR_STATE_FORMAT,
    editor_state_json_v3::{EDITOR_STATE_V3_FORMAT_VERSION, EditorStateJsonCodecV3},
    editor_state_v3_error::{EditorStateV3CodecError, EditorStateV3PendingFormatError},
    editor_value_payload_v1::{decode_selection_record_v1, encode_selection_record_v1},
    editor_value_payload_v2::{
        EditorValueRecordV2Error, EditorValueRecordV2ErrorCode, decode_pending_format_records_v2,
        encode_pending_format_records_v2,
    },
    editor_value_preflight_v2::preflight_pending_format_records_v2,
    json_size::JsonByteCounter,
    operation_preflight::preflight_operation_payload,
    operation_sequence_v1::validate_operation_sequence_count,
    operation_sequence_v5::{
        OperationSequenceEncodingV5, OperationSequenceErrorV5, count_operation_sequence_v5,
        decode_operation_sequence_v5,
    },
    transaction_payload_v1::encode_transaction_metadata_v1,
};

/// Wire version accepted and emitted by [`CommitJsonCodecV6`].
pub const COMMIT_V6_FORMAT_VERSION: u32 = 6;

/// Strict JSON codec for lossless flat-list-aware durable commits.
///
/// Commit V6 embeds Editor State V3 and the V6 operation payload language. Decode
/// reconstructs a transaction and atomically reapplies it; derived inverse
/// operations, relocation maps, and change summaries are never trusted from
/// the wire.
#[derive(Clone, Debug)]
pub struct CommitJsonCodecV6 {
    context: EditorContext,
    state_codec: EditorStateJsonCodecV3,
}

impl CommitJsonCodecV6 {
    /// Creates a Commit V6 codec bound to one immutable runtime context.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let state_codec = EditorStateJsonCodecV3::new(context.clone());
        Self { context, state_codec }
    }

    /// Returns the complete context used to validate and replay every commit.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes and replay-proves one durable Commit V6 value.
    ///
    /// A decoded value proves internal consistency under this codec's context;
    /// the envelope is not authenticated and does not establish authorization,
    /// global ordering, or exactly-once delivery.
    ///
    /// # Errors
    ///
    /// Returns [`CommitV6CodecError`] for malformed or mismatched bindings,
    /// invalid property-aware payloads, resource-limit excess, or failed replay.
    pub fn decode(&self, json: &str) -> Result<Commit, CommitV6CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(CommitV6CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedCommitHeader<'_> = decode_json(json)?;
        if header.format != COMMIT_FORMAT {
            return Err(CommitV6CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: COMMIT_FORMAT,
            });
        }
        if header.format_version != COMMIT_V6_FORMAT_VERSION {
            return Err(CommitV6CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: COMMIT_V6_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedCommitRecordV6<'_> = decode_json(json)?;
        let _binding = decode_and_admit_binding(&envelope, self.context.schema())?;
        validate_before_header(envelope.before)?;

        let operation_preflight = count_operation_sequence_v5(
            envelope.forward_operations.get(),
            self.context.max_operations_per_transaction(),
        )
        .map_err(commit_operation_sequence_error_v6)?;
        preflight_operation_payload(envelope.result_selection.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV6CodecError::InvalidJson)?;
        preflight_pending_format_records_v2(envelope.result_pending_formats.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV6CodecError::InvalidJson)?;
        preflight_operation_payload(envelope.metadata.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV6CodecError::InvalidJson)?;

        let before = self
            .state_codec
            .decode(envelope.before.get())
            .map_err(|error| CommitV6CodecError::InvalidBeforeState(Box::new(error)))?;
        let operations = decode_operation_sequence_v5(
            envelope.forward_operations.get(),
            &self.context,
            operation_preflight,
        )
        .map_err(commit_operation_sequence_error_v6)?;

        let selection_record: Option<SelectionRecordV1> =
            decode_raw_record(envelope.result_selection)?;
        let selection = selection_record
            .map(decode_selection_record_v1)
            .transpose()
            .map_err(|error| commit_record_error_from_editor_value(&error))
            .map_err(CommitV6CodecError::InvalidCommit)?;
        let pending_format_records: Option<Vec<PendingFormatRecordV2>> =
            decode_raw_record(envelope.result_pending_formats)?;
        let pending_formats = pending_format_records
            .map(|records| decode_pending_format_records_v2(records, &self.context))
            .transpose()
            .map_err(|error| commit_record_error_from_editor_value_v2(&error))
            .map_err(CommitV6CodecError::InvalidCommit)?;
        let metadata_record: TransactionMetadataRecordV1 = decode_raw_record(envelope.metadata)?;
        let metadata =
            decode_commit_metadata(metadata_record).map_err(CommitV6CodecError::InvalidCommit)?;

        let transaction = Transaction::from_parts(
            before,
            operations,
            SelectionRelocationPolicy::default(),
            SelectionUpdate::Set(selection),
            PendingFormatsUpdate::Set(pending_formats),
            metadata,
        );
        let outcome = transaction
            .apply(&self.context, transaction.base_state())
            .map_err(|source| super::CommitApplicationError::from_transaction(&source))
            .map_err(CommitCodecError::Apply)
            .map_err(CommitV6CodecError::InvalidCommit)?;
        let TransactionOutcome::Committed(commit) = outcome else {
            return Err(CommitV6CodecError::InvalidCommit(CommitCodecError::UnexpectedUnchanged));
        };
        if let Some(operation_index) =
            first_operation_mismatch(transaction.operations(), commit.forward_operations())
        {
            return Err(CommitV6CodecError::InvalidCommit(
                CommitCodecError::NonCanonicalForwardOperations { operation_index },
            ));
        }
        Ok(*commit)
    }

    /// Encodes one exactly context-bound proved commit as deterministic compact V6 JSON.
    ///
    /// When encoding succeeds, decoding the result with this codec reconstructs
    /// the exact commit. The output can still exceed a tighter receiver budget.
    ///
    /// # Errors
    ///
    /// Returns [`CommitV6CodecError`] for context mismatch, an invalid retained
    /// payload, serialization failure, or output exceeding the decode budget.
    pub fn encode(&self, commit: &Commit) -> Result<String, CommitV6CodecError> {
        let CommitCheckpointParts { before, after, forward_operations, metadata } =
            commit.checkpoint_parts();
        if before.context() != &self.context || after.context() != &self.context {
            return Err(CommitV6CodecError::ContextConfigurationMismatch);
        }
        validate_operation_sequence_count(forward_operations, &self.context)
            .map_err(commit_operation_limit_error)
            .map_err(CommitV6CodecError::InvalidCommit)?;

        let before = EditorStateEncodingV3::try_new(before)
            .map_err(|error| {
                EditorStateV3CodecError::InvalidPendingFormats(
                    EditorStateV3PendingFormatError::from_editor_value(&error),
                )
            })
            .map_err(Box::new)
            .map_err(CommitV6CodecError::InvalidBeforeState)?;
        let result_selection = after.selection().map(encode_selection_record_v1);
        let result_pending_formats = after
            .pending_formats()
            .map(|formats| encode_pending_format_records_v2(formats, &self.context))
            .transpose()
            .map_err(|error| commit_record_error_from_editor_value_v2(&error))
            .map_err(CommitV6CodecError::InvalidCommit)?;
        let record = CommitEncodingV6 {
            context: &self.context,
            before,
            forward_operations: OperationSequenceEncodingV5::new(forward_operations, &self.context),
            result_selection,
            result_pending_formats,
            metadata: encode_transaction_metadata_v1(metadata),
        };

        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(CommitV6CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        if let Some(error) = record.forward_operations.take_error() {
            return Err(CommitV6CodecError::OperationPayload {
                operation_index: error.operation_index,
                source: error.source,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV6CodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV6CodecError::Encoding)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedCommitHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BorrowedSchemaIdRecord<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedCommitRecordV6<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: BorrowedSchemaIdRecord<'a>,
    #[serde(borrow)]
    schema_fingerprint: Cow<'a, str>,
    #[serde(borrow)]
    before: &'a RawValue,
    #[serde(borrow)]
    forward_operations: &'a RawValue,
    #[serde(borrow)]
    result_selection: &'a RawValue,
    #[serde(borrow)]
    result_pending_formats: &'a RawValue,
    #[serde(borrow)]
    metadata: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedBeforeHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, CommitV6CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(CommitV6CodecError::InvalidJson)
}

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, CommitV6CodecError>
where
    T: Deserialize<'de>,
{
    decode_json(raw.get())
}

fn decode_and_admit_binding(
    envelope: &BorrowedCommitRecordV6<'_>,
    compiled: &crate::schema::CompiledSchema,
) -> Result<DurableSchemaBinding, CommitV6CodecError> {
    let name = QualifiedName::try_new(envelope.schema.name.as_ref()).map_err(|source| {
        CommitV6CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(envelope.schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(envelope.schema.version).map_err(|source| {
        CommitV6CodecError::InvalidSchemaVersion { value: envelope.schema.version, source }
    })?;
    let schema = SchemaId::new(name, version);
    require_schema_id(compiled, &schema)?;
    let fingerprint = envelope.schema_fingerprint.parse::<SchemaFingerprint>()?;
    require_schema_fingerprint(compiled, fingerprint)?;
    Ok(DurableSchemaBinding::new(schema, fingerprint))
}

fn validate_before_header(raw: &RawValue) -> Result<(), CommitV6CodecError> {
    let header: BorrowedBeforeHeader<'_> = serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(EditorStateV3CodecError::InvalidJson)
        .map_err(|error| CommitV6CodecError::InvalidBeforeState(Box::new(error)))?;
    if header.format != EDITOR_STATE_FORMAT {
        return Err(CommitV6CodecError::InvalidBeforeState(Box::new(
            EditorStateV3CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: EDITOR_STATE_FORMAT,
            },
        )));
    }
    if header.format_version != EDITOR_STATE_V3_FORMAT_VERSION {
        return Err(CommitV6CodecError::InvalidBeforeState(Box::new(
            EditorStateV3CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: EDITOR_STATE_V3_FORMAT_VERSION,
            },
        )));
    }
    Ok(())
}

fn commit_operation_sequence_error_v6(error: OperationSequenceErrorV5) -> CommitV6CodecError {
    match error {
        OperationSequenceErrorV5::Json(source) => CommitV6CodecError::InvalidJson(source),
        OperationSequenceErrorV5::Limit(error) => {
            CommitV6CodecError::InvalidCommit(commit_operation_limit_error(error))
        }
        OperationSequenceErrorV5::Payload(error) => CommitV6CodecError::OperationPayload {
            operation_index: error.operation_index,
            source: error.source,
        },
    }
}

fn commit_record_error_from_editor_value_v2(error: &EditorValueRecordV2Error) -> CommitCodecError {
    let code = match error.code() {
        EditorValueRecordV2ErrorCode::InvalidFormatName => {
            CommitRecordErrorCode::InvalidQualifiedName
        }
        EditorValueRecordV2ErrorCode::InvalidPropertyName => {
            CommitRecordErrorCode::InvalidPendingFormatPropertyName
        }
        EditorValueRecordV2ErrorCode::InvalidPropertyValue => {
            CommitRecordErrorCode::InvalidPendingFormatPropertyValue
        }
        EditorValueRecordV2ErrorCode::InvalidFormatInstance => {
            CommitRecordErrorCode::PendingFormatNotAllowed
        }
        EditorValueRecordV2ErrorCode::PendingFormatLimit => {
            CommitRecordErrorCode::PendingFormatLimit
        }
        EditorValueRecordV2ErrorCode::NonCanonicalPendingFormats => {
            CommitRecordErrorCode::NonCanonicalPendingFormats
        }
        EditorValueRecordV2ErrorCode::PropertyValueCountOverflow
        | EditorValueRecordV2ErrorCode::PropertyValueCountLimit => {
            CommitRecordErrorCode::PendingFormatPropertyValueLimit
        }
        EditorValueRecordV2ErrorCode::PropertyStringBytesOverflow
        | EditorValueRecordV2ErrorCode::PropertyStringBytesLimit => {
            CommitRecordErrorCode::PendingFormatPropertyStringBytesLimit
        }
    };
    let location =
        error.format_index().map_or(CommitRecordLocation::ResultPendingFormats, |format_index| {
            CommitRecordLocation::ResultPendingFormat { format_index }
        });
    CommitRecordError::new(code, location, error.diagnostic_value().clone()).into()
}
