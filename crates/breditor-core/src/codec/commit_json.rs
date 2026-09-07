use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, CommitApplicationError, CommitCodecError, CommitRecordError,
        CommitRecordErrorCode, CommitRecordLocation, EditorStateCodecError, JsonFailure,
    },
    identity::QualifiedName,
    operation::{Operation, SelectionRelocationPolicy},
    record::{
        COMMIT_FORMAT as RECORD_FORMAT, COMMIT_FORMAT_VERSION as RECORD_FORMAT_VERSION,
        CommitRecordV1, HistoryIntentRecordV1, PendingFormatRecordV1, SelectionRecordV1,
        TransactionMetadataRecordV1,
    },
    schema::require_exact_breditor_base,
    state::EditorContext,
    transaction::{
        Commit, CommitCheckpointParts, HistoryIntent, PendingFormatsUpdate, SelectionUpdate,
        Transaction, TransactionMetadata, TransactionOutcome,
    },
};

use super::{
    editor_state_encoding::EditorStateEncoding,
    editor_state_json::{
        EDITOR_STATE_FORMAT_VERSION, EditorStateJsonCodec,
        editor_state_record_error_from_editor_value,
    },
    editor_value_payload_v1::{
        EditorValueRecordError, SelectionEndpoint, decode_pending_format_records_v1,
        decode_selection_record_v1, encode_pending_format_records_v1, encode_selection_record_v1,
    },
    json_size::JsonByteCounter,
    operation_preflight::{preflight_operation_payload, preflight_pending_formats_payload},
    operation_sequence_v1::{
        IndexedOperationValidationError, OperationSequenceDecodeError, OperationSequenceEncoding,
        OperationSequenceLimitError, decode_operation_sequence, preflight_operation_sequence,
        validate_operation_sequence_count,
    },
    transaction_payload_v1::encode_transaction_metadata_v1,
};

/// Stable identifier for Breditor's self-contained durable commit envelope.
pub const COMMIT_FORMAT: &str = RECORD_FORMAT;

/// Durable commit wire version implemented by this codec.
pub const COMMIT_FORMAT_VERSION: u32 = RECORD_FORMAT_VERSION;

const COMMIT_BEFORE_STATE_FORMAT: &str = "breditor/editor-state";
const COMMIT_BEFORE_STATE_FORMAT_VERSION: u32 = 1;

// Commit V1 embeds Editor State V1 by value. If the default state encoder ever
// moves to another version, this boundary must choose an explicit V1 encoder
// or increment Commit's own format version rather than drifting silently.
const _: () = assert!(EDITOR_STATE_FORMAT_VERSION == COMMIT_BEFORE_STATE_FORMAT_VERSION);

/// Strict codec for one self-contained, replay-proved commit.
///
/// Commit V1 stores the complete before-state checkpoint, the already-filtered
/// forward operation recipe, the exact result selection and pending formats,
/// and transaction metadata. Decode atomically reapplies that recipe under the
/// caller-supplied [`EditorContext`] and returns only the derived [`Commit`].
/// The after document, inverse operations, relocation map, and change set are
/// deliberately derived rather than trusted wire claims.
#[derive(Clone, Debug)]
pub struct CommitJsonCodec {
    context: EditorContext,
    state_codec: EditorStateJsonCodec,
}

impl CommitJsonCodec {
    /// Creates a commit codec bound to one immutable runtime context.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let state_codec = EditorStateJsonCodec::new(context.clone());
        Self { context, state_codec }
    }

    /// Returns the schema, document limits, and operation ceiling used by this codec.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes and replay-proves one durable commit.
    ///
    /// The record is self-contained but not authenticated or globally ordered.
    /// A valid result proves internal consistency under this codec's context;
    /// it does not authorize metadata or provide exactly-once delivery.
    ///
    /// # Errors
    ///
    /// Returns [`CommitCodecError`] for an oversized or malformed record,
    /// unsupported format, invalid before checkpoint, invalid state/metadata
    /// values, operation failure, replay failure, or a noncanonical sequence
    /// containing an operation filtered as unchanged.
    ///
    /// Outer-envelope JSON locations are relative to the complete input. JSON
    /// failures from the embedded before state, forward sequence, result values,
    /// or metadata are relative to that borrowed subvalue; stable codes, indexes,
    /// and typed locations are the control-flow contract.
    pub fn decode(&self, json: &str) -> Result<Commit, CommitCodecError> {
        require_exact_breditor_base(self.context.schema())
            .map_err(|_| CommitCodecError::ContextConfigurationMismatch)?;
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(CommitCodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedCommitHeader<'_> = decode_json(json)?;
        if header.format != COMMIT_FORMAT {
            return Err(CommitCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: COMMIT_FORMAT,
            });
        }
        if header.format_version != COMMIT_FORMAT_VERSION {
            return Err(CommitCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: COMMIT_FORMAT_VERSION,
            });
        }
        let envelope: BorrowedCommitRecordV1<'_> = decode_json(json)?;
        validate_commit_before_header(envelope.before)?;

        // Bound every record-owned sequence before constructing the embedded
        // state or operation vector. The nested state codec performs its own
        // document and state-value preflights when called below.
        let operation_preflight =
            preflight_operation_sequence(envelope.forward_operations.get(), &self.context)
                .map_err(commit_operation_sequence_error)?;
        preflight_operation_payload(envelope.result_selection.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitCodecError::InvalidJson)?;
        preflight_pending_formats_payload(envelope.result_pending_formats.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitCodecError::InvalidJson)?;
        preflight_operation_payload(envelope.metadata.get(), &self.context)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitCodecError::InvalidJson)?;

        let before = self
            .state_codec
            .decode(envelope.before.get())
            .map_err(CommitCodecError::InvalidBeforeState)?;
        let operations = decode_operation_sequence(
            envelope.forward_operations.get(),
            &self.context,
            operation_preflight,
        )
        .map_err(commit_operation_sequence_error)?;

        let selection_record: Option<SelectionRecordV1> =
            decode_raw_record(envelope.result_selection)?;
        let selection = selection_record
            .map(decode_selection_record_v1)
            .transpose()
            .map_err(|error| commit_record_error_from_editor_value(&error))?;
        let pending_format_records: Option<Vec<PendingFormatRecordV1>> =
            decode_raw_record(envelope.result_pending_formats)?;
        let pending_formats = pending_format_records
            .map(|records| decode_pending_format_records_v1(records, &self.context))
            .transpose()
            .map_err(|error| commit_record_error_from_editor_value(&error))?;
        let metadata_record: TransactionMetadataRecordV1 = decode_raw_record(envelope.metadata)?;
        let metadata = decode_commit_metadata(metadata_record)?;

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
            .map_err(|source| CommitApplicationError::from_transaction(&source))
            .map_err(CommitCodecError::Apply)?;
        let TransactionOutcome::Committed(commit) = outcome else {
            return Err(CommitCodecError::UnexpectedUnchanged);
        };
        if let Some(operation_index) =
            first_operation_mismatch(transaction.operations(), commit.forward_operations())
        {
            return Err(CommitCodecError::NonCanonicalForwardOperations { operation_index });
        }
        Ok(*commit)
    }

    /// Encodes one proved commit into deterministic compact Commit V1 JSON.
    ///
    /// The honest law is `decode(encode(commit)) == commit` when encode
    /// succeeds. Some valid in-memory commits cannot fit the shared JSON byte
    /// cap and return a typed output-too-large error.
    ///
    /// # Errors
    ///
    /// Returns [`CommitCodecError`] for context mismatch, an operation/value
    /// outside V1, serialization failure, or an output exceeding the decode
    /// byte budget.
    pub fn encode(&self, commit: &Commit) -> Result<String, CommitCodecError> {
        require_exact_breditor_base(self.context.schema())
            .map_err(|_| CommitCodecError::ContextConfigurationMismatch)?;
        let CommitCheckpointParts { before, after, forward_operations, metadata } =
            commit.checkpoint_parts();
        if before.context() != &self.context || after.context() != &self.context {
            return Err(CommitCodecError::ContextConfigurationMismatch);
        }
        validate_operation_sequence_count(forward_operations, &self.context)
            .map_err(commit_operation_limit_error)?;

        let before = EditorStateEncoding::try_new(before).map_err(|error| {
            CommitCodecError::InvalidBeforeState(editor_state_record_error_from_editor_value(
                &error,
            ))
        })?;
        let result_selection = after.selection().map(encode_selection_record_v1);
        let result_pending_formats = after
            .pending_formats()
            .map(|formats| encode_pending_format_records_v1(formats, &self.context))
            .transpose()
            .map_err(|error| commit_record_error_from_editor_value(&error))?;
        let record = CommitRecordV1 {
            format: COMMIT_FORMAT.to_owned(),
            format_version: COMMIT_FORMAT_VERSION,
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
            return Err(CommitCodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        if let Some(error) = record.forward_operations.take_validation_error() {
            return Err(commit_operation_validation_error(error));
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitCodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(CommitCodecError::Encoding)
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
#[serde(rename_all = "camelCase")]
struct BorrowedCommitBeforeHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedCommitRecordV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
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

fn decode_json<'de, T>(json: &'de str) -> Result<T, CommitCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(CommitCodecError::InvalidJson)
}

fn decode_raw_record<'de, T>(raw: &'de RawValue) -> Result<T, CommitCodecError>
where
    T: Deserialize<'de>,
{
    decode_json(raw.get())
}

fn validate_commit_before_header(raw: &RawValue) -> Result<(), CommitCodecError> {
    let header: BorrowedCommitBeforeHeader<'_> = serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(EditorStateCodecError::InvalidJson)
        .map_err(CommitCodecError::InvalidBeforeState)?;
    if header.format != COMMIT_BEFORE_STATE_FORMAT {
        return Err(CommitCodecError::InvalidBeforeState(
            EditorStateCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: COMMIT_BEFORE_STATE_FORMAT,
            },
        ));
    }
    if header.format_version != COMMIT_BEFORE_STATE_FORMAT_VERSION {
        return Err(CommitCodecError::InvalidBeforeState(
            EditorStateCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: COMMIT_BEFORE_STATE_FORMAT_VERSION,
            },
        ));
    }
    Ok(())
}

pub(crate) fn decode_commit_metadata(
    record: TransactionMetadataRecordV1,
) -> Result<TransactionMetadata, CommitCodecError> {
    let action = record
        .action
        .map(|value| {
            QualifiedName::try_from(value).map_err(|error| {
                CommitRecordError::new(
                    CommitRecordErrorCode::InvalidQualifiedName,
                    CommitRecordLocation::MetadataAction,
                    error.to_string(),
                )
            })
        })
        .transpose()?;
    let history = match record.history {
        HistoryIntentRecordV1::Record {} => HistoryIntent::Record,
        HistoryIntentRecordV1::Merge { group } => HistoryIntent::Merge {
            group: QualifiedName::try_from(group).map_err(|error| {
                CommitRecordError::new(
                    CommitRecordErrorCode::InvalidQualifiedName,
                    CommitRecordLocation::MetadataHistoryGroup,
                    error.to_string(),
                )
            })?,
        },
        HistoryIntentRecordV1::Ignore {} => HistoryIntent::Ignore,
    };
    Ok(TransactionMetadata::new(action, history))
}

pub(crate) fn commit_record_error_from_editor_value(
    error: &EditorValueRecordError,
) -> CommitCodecError {
    let (code, location) = match error {
        EditorValueRecordError::InvalidSelectionPath { endpoint, .. } => (
            CommitRecordErrorCode::InvalidSelectionPath,
            match endpoint {
                SelectionEndpoint::Anchor => CommitRecordLocation::ResultSelectionAnchor,
                SelectionEndpoint::Focus => CommitRecordLocation::ResultSelectionFocus,
            },
        ),
        EditorValueRecordError::InvalidPendingFormatName { format_index, .. } => (
            CommitRecordErrorCode::InvalidQualifiedName,
            CommitRecordLocation::ResultPendingFormat { format_index: *format_index },
        ),
        EditorValueRecordError::PendingFormatLimit { .. } => {
            (CommitRecordErrorCode::PendingFormatLimit, CommitRecordLocation::ResultPendingFormats)
        }
        EditorValueRecordError::NonCanonicalPendingFormats { format_index, .. } => (
            CommitRecordErrorCode::NonCanonicalPendingFormats,
            CommitRecordLocation::ResultPendingFormat { format_index: *format_index },
        ),
        EditorValueRecordError::PendingFormatNotAllowed { format_index }
        | EditorValueRecordError::PendingFormatPropertiesNotAllowed { format_index } => (
            CommitRecordErrorCode::PendingFormatNotAllowed,
            CommitRecordLocation::ResultPendingFormat { format_index: *format_index },
        ),
    };
    CommitRecordError::new(code, location, error.to_string()).into()
}

pub(crate) fn commit_operation_sequence_error(
    error: OperationSequenceDecodeError,
) -> CommitCodecError {
    match error {
        OperationSequenceDecodeError::Json(source) => CommitCodecError::InvalidJson(source),
        OperationSequenceDecodeError::Limit(error) => commit_operation_limit_error(error),
        OperationSequenceDecodeError::OperationJson { operation_index, source } => {
            CommitCodecError::InvalidOperationJson { operation_index, source }
        }
        OperationSequenceDecodeError::OperationRecord { operation_index, source } => {
            CommitCodecError::InvalidOperation { operation_index, source }
        }
        OperationSequenceDecodeError::OperationValidation(error) => {
            commit_operation_validation_error(error)
        }
    }
}

pub(crate) const fn commit_operation_limit_error(
    error: OperationSequenceLimitError,
) -> CommitCodecError {
    CommitCodecError::OperationLimit { actual: error.actual, maximum: error.maximum }
}

pub(crate) fn commit_operation_validation_error(
    error: IndexedOperationValidationError,
) -> CommitCodecError {
    CommitCodecError::OperationValidation {
        operation_index: error.operation_index,
        source: error.source,
    }
}

pub(crate) fn first_operation_mismatch(wire: &[Operation], applied: &[Operation]) -> Option<u64> {
    let shared = wire.len().min(applied.len());
    let mismatch =
        wire[..shared].iter().zip(&applied[..shared]).position(|(wire, applied)| wire != applied);
    mismatch.or((wire.len() != applied.len()).then_some(shared)).map(usize_to_u64)
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}
