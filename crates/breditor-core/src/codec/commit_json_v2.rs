use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{BoundedDiagnostic, CommitCodecError, JsonFailure},
    identity::QualifiedName,
    operation::SelectionRelocationPolicy,
    record::{PendingFormatRecordV1, SelectionRecordV1, TransactionMetadataRecordV1},
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
    commit_encoding_v2::CommitEncodingV2,
    commit_json::{
        COMMIT_FORMAT, commit_operation_limit_error, commit_operation_sequence_error,
        commit_operation_validation_error, commit_record_error_from_editor_value,
        decode_commit_metadata, first_operation_mismatch,
    },
    commit_v2_error::CommitV2CodecError,
    editor_state_encoding_v2::EditorStateEncodingV2,
    editor_state_json::EDITOR_STATE_FORMAT,
    editor_state_json_v2::{EDITOR_STATE_V2_FORMAT_VERSION, EditorStateJsonCodecV2},
    editor_state_v2_error::EditorStateV2CodecError,
    editor_value_payload_v1::{
        decode_pending_format_records_v1, decode_selection_record_v1,
        encode_pending_format_records_v1, encode_selection_record_v1,
    },
    json_size::JsonByteCounter,
    operation_preflight::{preflight_operation_payload, preflight_pending_formats_payload},
    operation_sequence_v1::{
        OperationSequenceEncoding, decode_operation_sequence, preflight_operation_sequence,
        validate_operation_sequence_count,
    },
    transaction_payload_v1::encode_transaction_metadata_v1,
};

/// Wire version accepted and emitted by [`CommitJsonCodecV2`].
pub const COMMIT_V2_FORMAT_VERSION: u32 = 2;

/// Strict JSON codec for self-contained, fingerprint-bearing durable commits.
#[derive(Clone, Debug)]
pub struct CommitJsonCodecV2 {
    context: EditorContext,
    state_codec: EditorStateJsonCodecV2,
}

impl CommitJsonCodecV2 {
    /// Creates a Commit V2 codec bound to one immutable runtime context.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let state_codec = EditorStateJsonCodecV2::new(context.clone());
        Self { context, state_codec }
    }

    /// Returns the complete context used to replay every decoded commit.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes and replay-proves one durable Commit V2 value.
    ///
    /// The outer binding and nested Editor State V2 binding are independently
    /// checked. Forward operations remain the closed primitive payloads and
    /// are reapplied atomically under the receiving context.
    ///
    /// # Errors
    ///
    /// Returns [`CommitV2CodecError`] for malformed or mismatched bindings,
    /// mixed nested generations, invalid payloads, failed replay, noncanonical
    /// operations, or an exceeded resource limit.
    pub fn decode(&self, json: &str) -> Result<Commit, CommitV2CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(CommitV2CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedCommitHeader<'_> = decode_json(json)?;
        if header.format != COMMIT_FORMAT {
            return Err(CommitV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: COMMIT_FORMAT,
            });
        }
        if header.format_version != COMMIT_V2_FORMAT_VERSION {
            return Err(CommitV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: COMMIT_V2_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedCommitRecordV2<'_> = decode_json(json)?;
        let _binding = decode_and_admit_binding(&envelope, self.context.schema())?;
        validate_before_header(envelope.before)?;

        let operation_preflight =
            preflight_operation_sequence(envelope.forward_operations.get(), &self.context)
                .map_err(commit_operation_sequence_error)
                .map_err(CommitV2CodecError::InvalidCommit)?;
        preflight_operation_payload(envelope.result_selection.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV2CodecError::InvalidJson)?;
        preflight_pending_formats_payload(envelope.result_pending_formats.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV2CodecError::InvalidJson)?;
        preflight_operation_payload(envelope.metadata.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV2CodecError::InvalidJson)?;

        let before = self
            .state_codec
            .decode(envelope.before.get())
            .map_err(|error| CommitV2CodecError::InvalidBeforeState(Box::new(error)))?;
        let operations = decode_operation_sequence(
            envelope.forward_operations.get(),
            &self.context,
            operation_preflight,
        )
        .map_err(commit_operation_sequence_error)
        .map_err(CommitV2CodecError::InvalidCommit)?;

        let selection_record: Option<SelectionRecordV1> =
            decode_raw_record(envelope.result_selection)?;
        let selection = selection_record
            .map(decode_selection_record_v1)
            .transpose()
            .map_err(|error| commit_record_error_from_editor_value(&error))
            .map_err(CommitV2CodecError::InvalidCommit)?;
        let pending_format_records: Option<Vec<PendingFormatRecordV1>> =
            decode_raw_record(envelope.result_pending_formats)?;
        let pending_formats = pending_format_records
            .map(|records| decode_pending_format_records_v1(records, &self.context))
            .transpose()
            .map_err(|error| commit_record_error_from_editor_value(&error))
            .map_err(CommitV2CodecError::InvalidCommit)?;
        let metadata_record: TransactionMetadataRecordV1 = decode_raw_record(envelope.metadata)?;
        let metadata =
            decode_commit_metadata(metadata_record).map_err(CommitV2CodecError::InvalidCommit)?;

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
            .map_err(CommitV2CodecError::InvalidCommit)?;
        let TransactionOutcome::Committed(commit) = outcome else {
            return Err(CommitV2CodecError::InvalidCommit(CommitCodecError::UnexpectedUnchanged));
        };
        if let Some(operation_index) =
            first_operation_mismatch(transaction.operations(), commit.forward_operations())
        {
            return Err(CommitV2CodecError::InvalidCommit(
                CommitCodecError::NonCanonicalForwardOperations { operation_index },
            ));
        }
        Ok(*commit)
    }

    /// Encodes one exactly context-bound proved commit as deterministic compact V2 JSON.
    ///
    /// # Errors
    ///
    /// Returns [`CommitV2CodecError`] for context mismatch, an invalid payload,
    /// serialization failure, or output exceeding the decode byte budget.
    pub fn encode(&self, commit: &Commit) -> Result<String, CommitV2CodecError> {
        let CommitCheckpointParts { before, after, forward_operations, metadata } =
            commit.checkpoint_parts();
        if before.context() != &self.context || after.context() != &self.context {
            return Err(CommitV2CodecError::ContextConfigurationMismatch);
        }
        validate_operation_sequence_count(forward_operations, &self.context)
            .map_err(commit_operation_limit_error)
            .map_err(CommitV2CodecError::InvalidCommit)?;

        let before = EditorStateEncodingV2::try_new(before)
            .map_err(|error| {
                super::editor_state_json_v2::editor_state_record_error_from_editor_value(&error)
            })
            .map_err(EditorStateV2CodecError::InvalidEditorState)
            .map_err(|error| CommitV2CodecError::InvalidBeforeState(Box::new(error)))?;
        let result_selection = after.selection().map(encode_selection_record_v1);
        let result_pending_formats = after
            .pending_formats()
            .map(|formats| encode_pending_format_records_v1(formats, &self.context))
            .transpose()
            .map_err(|error| commit_record_error_from_editor_value(&error))
            .map_err(CommitV2CodecError::InvalidCommit)?;
        let record = CommitEncodingV2 {
            context: &self.context,
            before,
            forward_operations: OperationSequenceEncoding::new(forward_operations, &self.context),
            result_selection,
            result_pending_formats,
            metadata: encode_transaction_metadata_v1(metadata),
        };

        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(CommitV2CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        if let Some(error) = record.forward_operations.take_validation_error() {
            return Err(CommitV2CodecError::InvalidCommit(commit_operation_validation_error(
                error,
            )));
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV2CodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitV2CodecError::Encoding)
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
struct BorrowedCommitRecordV2<'a> {
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

fn decode_json<'de, T>(json: &'de str) -> Result<T, CommitV2CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(CommitV2CodecError::InvalidJson)
}

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, CommitV2CodecError>
where
    T: Deserialize<'de>,
{
    decode_json(raw.get())
}

fn decode_and_admit_binding(
    envelope: &BorrowedCommitRecordV2<'_>,
    compiled: &crate::schema::CompiledSchema,
) -> Result<DurableSchemaBinding, CommitV2CodecError> {
    let name = QualifiedName::try_new(envelope.schema.name.as_ref()).map_err(|source| {
        CommitV2CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(envelope.schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(envelope.schema.version).map_err(|source| {
        CommitV2CodecError::InvalidSchemaVersion { value: envelope.schema.version, source }
    })?;
    let schema = SchemaId::new(name, version);
    require_schema_id(compiled, &schema)?;
    let fingerprint = envelope.schema_fingerprint.parse::<SchemaFingerprint>()?;
    require_schema_fingerprint(compiled, fingerprint)?;
    Ok(DurableSchemaBinding::new(schema, fingerprint))
}

fn validate_before_header(raw: &RawValue) -> Result<(), CommitV2CodecError> {
    let header: BorrowedBeforeHeader<'_> = serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(EditorStateV2CodecError::InvalidJson)
        .map_err(|error| CommitV2CodecError::InvalidBeforeState(Box::new(error)))?;
    if header.format != EDITOR_STATE_FORMAT {
        return Err(CommitV2CodecError::InvalidBeforeState(Box::new(
            EditorStateV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: EDITOR_STATE_FORMAT,
            },
        )));
    }
    if header.format_version != EDITOR_STATE_V2_FORMAT_VERSION {
        return Err(CommitV2CodecError::InvalidBeforeState(Box::new(
            EditorStateV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: EDITOR_STATE_V2_FORMAT_VERSION,
            },
        )));
    }
    Ok(())
}
