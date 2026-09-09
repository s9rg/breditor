use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, EditorStateCodecError, JsonFailure, RetainedResourceKind,
        SessionCheckpointApplicationError, SessionCheckpointCodecError, SessionCheckpointLimits,
        SessionCheckpointRecordError, SessionCheckpointRecordErrorCode,
        SessionCheckpointRecordLocation, SessionCheckpointReplayDirection,
        SessionCheckpointResourceLimit, SessionCheckpointTopologyError,
    },
    identity::QualifiedName,
    operation::{Operation, SelectionRelocationPolicy},
    record::{
        DecimalU64Record, PendingFormatRecordV1, SESSION_CHECKPOINT_FORMAT as RECORD_FORMAT,
        SESSION_CHECKPOINT_FORMAT_VERSION as RECORD_FORMAT_VERSION, SelectionRecordV1,
        SessionCheckpointRecordV1, SessionHistoryEntryRecordV1,
    },
    schema::require_exact_breditor_base,
    session::{
        EditorSession, EditorSessionCheckpointParts, HistoryCapacity,
        HistoryCheckpointInvariantError, HistoryEntry,
    },
    state::{EditorContext, EditorState, Revision},
    transaction::{
        PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata, TransactionOutcome,
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
    operation_sequence_v1::{
        IndexedOperationValidationError, OperationSequenceDecodeError, OperationSequenceEncoding,
        OperationSequenceLimitError, decode_operation_sequence,
    },
    session_checkpoint_entries_v1::{
        BorrowedSessionHistoryEntryRecordV1, PreflightedSessionHistoryEntry,
        SessionHistoryEntriesPreflightError, count_session_history_entries,
        preflight_session_history_entries,
    },
};

pub(crate) type SessionHistoryEntryEncoding<'a> =
    SessionHistoryEntryRecordV1<OperationSequenceEncoding<'a>>;
type SessionCheckpointEncoding<'a> =
    SessionCheckpointRecordV1<EditorStateEncoding<'a>, Vec<SessionHistoryEntryEncoding<'a>>>;

/// Stable identifier for Breditor's durable bounded-session checkpoint.
pub const SESSION_CHECKPOINT_FORMAT: &str = RECORD_FORMAT;

/// Session-checkpoint wire version implemented by this codec.
pub const SESSION_CHECKPOINT_FORMAT_VERSION: u32 = RECORD_FORMAT_VERSION;

const SESSION_HISTORY_BASE_FORMAT: &str = "breditor/editor-state";
const SESSION_HISTORY_BASE_FORMAT_VERSION: u32 = 1;

// Session Checkpoint V1 embeds Editor State V1 by value. A future default
// editor-state encoder must not silently widen this composition boundary.
const _: () = assert!(EDITOR_STATE_FORMAT_VERSION == SESSION_HISTORY_BASE_FORMAT_VERSION);

/// Strict codec for one bounded linear-history editor session.
///
/// V1 stores one normalized revision-zero history base followed by compact
/// chronological replay recipes. Decode derives every later document and
/// inverse recipe, proves both replay directions, installs the exact separate
/// current revision at the cursor, and creates a fresh process-local history
/// stamp. The record is a checkpoint, not an ordered or authenticated log.
#[derive(Clone, Debug)]
pub struct SessionCheckpointJsonCodec {
    context: EditorContext,
    limits: SessionCheckpointLimits,
    state_codec: EditorStateJsonCodec,
}

impl SessionCheckpointJsonCodec {
    /// Creates a codec with conservative default aggregate-history limits.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let state_codec = EditorStateJsonCodec::new(context.clone());
        Self { context, limits: SessionCheckpointLimits::default(), state_codec }
    }

    /// Replaces the host-authoritative aggregate-history admission policy.
    #[must_use]
    pub const fn with_limits(mut self, limits: SessionCheckpointLimits) -> Self {
        self.limits = limits;
        self
    }

    /// Returns the complete context installed on every restored boundary.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Returns the aggregate-history admission policy.
    #[must_use]
    pub const fn limits(&self) -> &SessionCheckpointLimits {
        &self.limits
    }

    /// Strictly decodes and replay-proves one complete session checkpoint.
    ///
    /// The caller-supplied context and codec limits are authoritative. A valid
    /// result proves internal chain consistency only; it proves no provenance,
    /// chronology, authorization, log position, or exactly-once delivery.
    ///
    /// # Errors
    ///
    /// Returns [`SessionCheckpointCodecError`] for malformed or unsupported
    /// JSON, invalid topology or values, resource-limit excess, failed replay,
    /// a noncanonical operation recipe, or an impossible checked assembly.
    pub fn decode(&self, json: &str) -> Result<EditorSession, SessionCheckpointCodecError> {
        require_exact_breditor_base(self.context.schema())
            .map_err(|_| SessionCheckpointCodecError::ContextConfigurationMismatch)?;
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(SessionCheckpointCodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedSessionCheckpointHeader<'_> = decode_outer_json(json)?;
        if header.format != SESSION_CHECKPOINT_FORMAT {
            return Err(SessionCheckpointCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: SESSION_CHECKPOINT_FORMAT,
            });
        }
        if header.format_version != SESSION_CHECKPOINT_FORMAT_VERSION {
            return Err(SessionCheckpointCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: SESSION_CHECKPOINT_FORMAT_VERSION,
            });
        }
        let envelope: BorrowedSessionCheckpointRecordV1<'_> = decode_outer_json(json)?;
        let capacity = decode_history_capacity(envelope.history_capacity, &self.limits)?;
        let entry_count = count_session_history_entries(envelope.entries.get(), capacity.get())
            .map_err(history_entries_preflight_error)?;
        validate_cursor(envelope.cursor, entry_count)?;

        let open_group_record: Option<Cow<'_, str>> = decode_outer_raw(envelope.open_merge_group)?;
        validate_open_group_topology(open_group_record.is_some(), envelope.cursor, entry_count)?;

        let current_revision = DecimalU64Record::try_from_decimal(
            envelope.current_revision.as_ref(),
        )
        .map_err(|error| {
            SessionCheckpointRecordError::new(
                SessionCheckpointRecordErrorCode::InvalidCurrentRevision,
                SessionCheckpointRecordLocation::CurrentRevision,
                error.to_string(),
            )
        })?;
        let open_merge_group = open_group_record
            .map(|group| {
                QualifiedName::try_from(group.into_owned()).map_err(|error| {
                    SessionCheckpointRecordError::new(
                        SessionCheckpointRecordErrorCode::InvalidQualifiedName,
                        SessionCheckpointRecordLocation::OpenMergeGroup,
                        error.to_string(),
                    )
                })
            })
            .transpose()?;

        let preflighted_entries = preflight_session_history_entries(
            envelope.entries.get(),
            &self.context,
            entry_count,
            self.limits.max_aggregate_forward_operations(),
        )
        .map_err(history_entries_preflight_error)?;

        validate_history_base_header(envelope.history_base)?;
        let history_base = self
            .state_codec
            .decode(envelope.history_base.get())
            .map_err(SessionCheckpointCodecError::InvalidHistoryBase)?;
        if history_base.snapshot().revision() != Revision::ZERO {
            return Err(SessionCheckpointCodecError::NonZeroHistoryBaseRevision {
                actual: history_base.snapshot().revision(),
            });
        }

        let (entries, current_boundary) =
            self.decode_history_chain(&history_base, preflighted_entries, envelope.cursor)?;
        let current =
            current_boundary.with_checkpoint_revision(Revision::new(current_revision.get()));
        EditorSession::try_from_checkpoint_parts(
            current,
            capacity,
            entries,
            envelope.cursor,
            open_merge_group,
        )
        .map_err(history_assembly_error)
    }

    /// Encodes one live session into deterministic compact Session Checkpoint V1 JSON.
    ///
    /// Historical revisions and the process-local history stamp are normalized
    /// or omitted. Encoding can reject an otherwise valid in-memory session
    /// when its configured capacity, aggregate recipes, logical retained
    /// boundaries, or complete JSON exceed this codec's admission policy.
    ///
    /// # Errors
    ///
    /// Returns [`SessionCheckpointCodecError`] for context mismatch, resource
    /// excess, an impossible private invariant, an unrepresentable V1 value,
    /// operation validation failure, or serialization/byte-budget failure.
    pub fn encode(&self, session: &EditorSession) -> Result<String, SessionCheckpointCodecError> {
        require_exact_breditor_base(self.context.schema())
            .map_err(|_| SessionCheckpointCodecError::ContextConfigurationMismatch)?;
        let EditorSessionCheckpointParts { state, history } = session.checkpoint_parts();
        if state.context() != &self.context {
            return Err(SessionCheckpointCodecError::ContextConfigurationMismatch);
        }
        validate_capacity_policy(history.capacity, &self.limits)?;
        if history.entry_count > history.capacity.get() {
            return Err(SessionCheckpointTopologyError::EntryCountExceedsCapacity {
                actual: u64::from(history.entry_count),
                capacity: history.capacity.get(),
            }
            .into());
        }
        if history.cursor > history.entry_count {
            return Err(SessionCheckpointTopologyError::CursorOutOfBounds {
                cursor: u64::from(history.cursor),
                entries: u64::from(history.entry_count),
            }
            .into());
        }
        validate_open_group_topology(
            history.open_merge_group.is_some(),
            history.cursor,
            u64::from(history.entry_count),
        )?;

        let entries = history.entries.collect::<Vec<_>>();
        if entries.len() != history.entry_count as usize {
            return Err(runtime_invariant(
                "session history entry iterator length disagrees with its fixed-width count",
            ));
        }
        let history_base_source =
            entries.first().map_or(state, |entry| entry.checkpoint_parts().before);
        if history_base_source.context() != &self.context {
            return Err(SessionCheckpointCodecError::ContextConfigurationMismatch);
        }
        if history_base_source.snapshot().lineage() != state.snapshot().lineage() {
            return Err(runtime_invariant(
                "session history base and current state use different lineages",
            ));
        }
        let history_base = history_base_source.with_checkpoint_revision(Revision::ZERO);
        let history_base_encoding =
            EditorStateEncoding::try_new(&history_base).map_err(|error| {
                SessionCheckpointCodecError::InvalidHistoryBase(
                    editor_state_record_error_from_editor_value(&error),
                )
            })?;

        let encoded_entries = self.encode_history_entries(history_base_source, &entries)?;

        let cursor_boundary = if history.cursor == 0 {
            history_base_source
        } else {
            let index = (history.cursor - 1) as usize;
            entries
                .get(index)
                .map(|entry| entry.checkpoint_parts().after)
                .ok_or_else(|| runtime_invariant("session cursor boundary is absent"))?
        };
        if !same_semantic_state(cursor_boundary, state) {
            return Err(runtime_invariant(
                "session current state disagrees with its logical history cursor boundary",
            ));
        }
        if let Some(redo_entry) = entries.get(history.cursor as usize)
            && !same_semantic_state(redo_entry.checkpoint_parts().before, state)
        {
            return Err(runtime_invariant(
                "session current state disagrees with its nearest redo boundary",
            ));
        }
        if history.open_merge_group.is_some() && cursor_boundary != state {
            return Err(runtime_invariant(
                "an open merge group does not end at the exact current editor state",
            ));
        }

        let record = SessionCheckpointRecordV1 {
            format: SESSION_CHECKPOINT_FORMAT.to_owned(),
            format_version: SESSION_CHECKPOINT_FORMAT_VERSION,
            history_base: history_base_encoding,
            current_revision: DecimalU64Record::new(state.snapshot().revision().get()),
            history_capacity: history.capacity.get(),
            cursor: history.cursor,
            entries: encoded_entries,
            open_merge_group: history.open_merge_group.map(|group| group.as_str().to_owned()),
        };

        self.serialize_record(&record)
    }

    pub(crate) fn decode_history_chain(
        &self,
        history_base: &EditorState,
        preflighted_entries: Vec<PreflightedSessionHistoryEntry<'_>>,
        cursor: u32,
    ) -> Result<(Vec<HistoryEntry>, EditorState), SessionCheckpointCodecError> {
        let mut retained = RetainedBoundaryBudget::default();
        retained.observe(history_base.document().summary(), 0, &self.limits)?;
        let mut boundary = history_base.clone();
        let mut current_boundary = (cursor == 0).then(|| history_base.clone());
        let mut entries = Vec::with_capacity(preflighted_entries.len());
        for (entry_index, preflight) in preflighted_entries.into_iter().enumerate() {
            let entry_index = usize_to_u64(entry_index);
            let record: BorrowedSessionHistoryEntryRecordV1<'_> =
                decode_entry_json(preflight.raw.get(), entry_index)?;
            let operations = decode_operation_sequence(
                record.forward_operations.get(),
                &self.context,
                preflight.operations,
            )
            .map_err(|error| history_operation_error(entry_index, error))?;
            let result_selection_record: Option<SelectionRecordV1> =
                decode_entry_raw(record.result_selection, entry_index)?;
            let result_selection = result_selection_record
                .map(decode_selection_record_v1)
                .transpose()
                .map_err(|error| session_record_error_from_editor_value(&error, entry_index))?;
            let result_pending_records: Option<Vec<PendingFormatRecordV1>> =
                decode_entry_raw(record.result_pending_formats, entry_index)?;
            let result_pending_formats = result_pending_records
                .map(|records| decode_pending_format_records_v1(records, &self.context))
                .transpose()
                .map_err(|error| session_record_error_from_editor_value(&error, entry_index))?;

            let (entry, after) = self.prove_entry(
                entry_index,
                &boundary,
                operations,
                result_selection,
                result_pending_formats,
            )?;
            retained.observe(
                after.document().summary(),
                entry_index.saturating_add(1),
                &self.limits,
            )?;
            if u64::from(cursor) == entry_index.saturating_add(1) {
                current_boundary = Some(after.clone());
            }
            entries.push(entry);
            boundary = after;
        }

        let current_boundary = current_boundary.ok_or_else(|| {
            runtime_invariant("validated session cursor did not identify a chronological boundary")
        })?;
        Ok((entries, current_boundary))
    }

    pub(crate) fn encode_history_entries<'a>(
        &'a self,
        history_base: &'a EditorState,
        entries: &[&'a HistoryEntry],
    ) -> Result<Vec<SessionHistoryEntryEncoding<'a>>, SessionCheckpointCodecError> {
        let normalized_base = history_base.with_checkpoint_revision(Revision::ZERO);
        let mut retained = RetainedBoundaryBudget::default();
        retained.observe(normalized_base.document().summary(), 0, &self.limits)?;
        let mut aggregate_operations = 0_u64;
        let mut previous = history_base;
        let mut encoded_entries = Vec::with_capacity(entries.len());
        for (entry_index, entry) in entries.iter().enumerate() {
            let entry_index = usize_to_u64(entry_index);
            let parts = entry.checkpoint_parts();
            if !same_semantic_state(previous, parts.before) {
                return Err(runtime_invariant(format!(
                    "session history entry {entry_index} is disconnected from its predecessor"
                )));
            }
            if parts.before.context() != &self.context || parts.after.context() != &self.context {
                return Err(SessionCheckpointCodecError::ContextConfigurationMismatch);
            }
            let lineage = history_base.snapshot().lineage();
            if parts.before.snapshot().lineage() != lineage
                || parts.after.snapshot().lineage() != lineage
            {
                return Err(runtime_invariant(format!(
                    "session history entry {entry_index} changes the fixed session lineage"
                )));
            }
            let operation_count = usize_to_u64(parts.forward_operations.len());
            validate_encoding_operation_count(entry_index, operation_count, &self.context)?;
            if parts.inverse_operations.len() != parts.forward_operations.len() {
                return Err(runtime_invariant(format!(
                    "session history entry {entry_index} has unequal forward and inverse recipes"
                )));
            }
            aggregate_operations = aggregate_operations
                .checked_add(operation_count)
                .ok_or(SessionCheckpointResourceLimit::AggregateForwardOperationsOverflow)?;
            let aggregate_maximum = self.limits.max_aggregate_forward_operations();
            if aggregate_operations > aggregate_maximum {
                return Err(SessionCheckpointResourceLimit::AggregateForwardOperations {
                    actual: aggregate_operations,
                    maximum: aggregate_maximum,
                }
                .into());
            }
            retained.observe(parts.after.document().summary(), entry_index + 1, &self.limits)?;
            let result_pending_formats = parts
                .after
                .pending_formats()
                .map(|formats| encode_pending_format_records_v1(formats, &self.context))
                .transpose()
                .map_err(|error| session_record_error_from_editor_value(&error, entry_index))?;
            encoded_entries.push(SessionHistoryEntryRecordV1 {
                forward_operations: OperationSequenceEncoding::new(
                    parts.forward_operations,
                    &self.context,
                ),
                result_selection: parts.after.selection().map(encode_selection_record_v1),
                result_pending_formats,
            });
            previous = parts.after;
        }
        Ok(encoded_entries)
    }

    fn serialize_record(
        &self,
        record: &SessionCheckpointEncoding<'_>,
    ) -> Result<String, SessionCheckpointCodecError> {
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, record);
        if byte_counter.exceeded() {
            return Err(SessionCheckpointCodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        for (entry_index, entry) in record.entries.iter().enumerate() {
            if let Some(error) = entry.forward_operations.take_validation_error() {
                return Err(history_operation_validation_error(usize_to_u64(entry_index), error));
            }
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(SessionCheckpointCodecError::Encoding)?;
        serde_json::to_string(record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(SessionCheckpointCodecError::Encoding)
    }

    pub(crate) fn prove_entry(
        &self,
        entry_index: u64,
        before: &EditorState,
        operations: Vec<Operation>,
        result_selection: Option<crate::selection::Selection>,
        result_pending_formats: Option<crate::document::FormatSet>,
    ) -> Result<(HistoryEntry, EditorState), SessionCheckpointCodecError> {
        let transaction = Transaction::from_parts(
            before.clone(),
            operations,
            SelectionRelocationPolicy::default(),
            SelectionUpdate::Set(result_selection),
            PendingFormatsUpdate::Set(result_pending_formats),
            TransactionMetadata::default(),
        );
        let outcome = transaction.apply(&self.context, before).map_err(|error| {
            SessionCheckpointCodecError::Apply(SessionCheckpointApplicationError::from_transaction(
                entry_index,
                SessionCheckpointReplayDirection::Forward,
                &error,
            ))
        })?;
        let TransactionOutcome::Committed(commit) = outcome else {
            return Err(SessionCheckpointCodecError::UnexpectedUnchanged {
                entry_index,
                direction: SessionCheckpointReplayDirection::Forward,
            });
        };
        let commit = *commit;
        if let Some(operation_index) =
            first_operation_mismatch(transaction.operations(), commit.forward_operations())
        {
            return Err(SessionCheckpointCodecError::NonCanonicalForwardOperations {
                entry_index,
                operation_index,
            });
        }

        let inverse_operations = commit.inverse_operations().to_vec();
        let after = commit.after().clone();
        let inverse = Transaction::new(&after, inverse_operations.clone())
            .with_selection_update(SelectionUpdate::Set(before.selection().cloned()))
            .with_pending_formats_update(PendingFormatsUpdate::Set(
                before.pending_formats().cloned(),
            ));
        let inverse_outcome = inverse.apply(&self.context, &after).map_err(|error| {
            SessionCheckpointCodecError::Apply(SessionCheckpointApplicationError::from_transaction(
                entry_index,
                SessionCheckpointReplayDirection::Inverse,
                &error,
            ))
        })?;
        let TransactionOutcome::Committed(inverse_commit) = inverse_outcome else {
            return Err(SessionCheckpointCodecError::UnexpectedUnchanged {
                entry_index,
                direction: SessionCheckpointReplayDirection::Inverse,
            });
        };
        if let Some(operation_index) =
            first_operation_mismatch(&inverse_operations, inverse_commit.forward_operations())
        {
            return Err(SessionCheckpointCodecError::NonCanonicalInverseOperations {
                entry_index,
                operation_index,
            });
        }
        if !same_semantic_state(inverse_commit.after(), before) {
            return Err(SessionCheckpointCodecError::InverseReplayResultMismatch { entry_index });
        }

        let entry = HistoryEntry::from_commit(&commit);
        Ok((entry, after))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedSessionCheckpointHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedHistoryBaseHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedSessionCheckpointRecordV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    history_base: &'a RawValue,
    #[serde(borrow)]
    current_revision: Cow<'a, str>,
    history_capacity: u32,
    cursor: u32,
    #[serde(borrow)]
    entries: &'a RawValue,
    #[serde(borrow)]
    open_merge_group: &'a RawValue,
}

fn decode_outer_json<'de, T>(json: &'de str) -> Result<T, SessionCheckpointCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(SessionCheckpointCodecError::InvalidJson)
}

fn decode_outer_raw<'de, T>(raw: &'de RawValue) -> Result<T, SessionCheckpointCodecError>
where
    T: Deserialize<'de>,
{
    decode_outer_json(raw.get())
}

fn decode_entry_json<'de, T>(
    json: &'de str,
    entry_index: u64,
) -> Result<T, SessionCheckpointCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(|source| SessionCheckpointCodecError::InvalidEntryJson { entry_index, source })
}

fn decode_entry_raw<'de, T>(
    raw: &'de RawValue,
    entry_index: u64,
) -> Result<T, SessionCheckpointCodecError>
where
    T: Deserialize<'de>,
{
    decode_entry_json(raw.get(), entry_index)
}

fn validate_history_base_header(raw: &RawValue) -> Result<(), SessionCheckpointCodecError> {
    let header: BorrowedHistoryBaseHeader<'_> = serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(EditorStateCodecError::InvalidJson)
        .map_err(SessionCheckpointCodecError::InvalidHistoryBase)?;
    if header.format != SESSION_HISTORY_BASE_FORMAT {
        return Err(SessionCheckpointCodecError::InvalidHistoryBase(
            EditorStateCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: SESSION_HISTORY_BASE_FORMAT,
            },
        ));
    }
    if header.format_version != SESSION_HISTORY_BASE_FORMAT_VERSION {
        return Err(SessionCheckpointCodecError::InvalidHistoryBase(
            EditorStateCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: SESSION_HISTORY_BASE_FORMAT_VERSION,
            },
        ));
    }
    Ok(())
}

pub(crate) fn decode_history_capacity(
    actual: u32,
    limits: &SessionCheckpointLimits,
) -> Result<HistoryCapacity, SessionCheckpointCodecError> {
    let capacity = HistoryCapacity::try_new(actual).map_err(|_| {
        SessionCheckpointResourceLimit::HistoryCapacity {
            actual,
            maximum: crate::session::MAX_HISTORY_CAPACITY,
        }
    })?;
    validate_capacity_policy(capacity, limits)?;
    Ok(capacity)
}

pub(crate) fn validate_capacity_policy(
    capacity: HistoryCapacity,
    limits: &SessionCheckpointLimits,
) -> Result<(), SessionCheckpointCodecError> {
    let maximum = limits.max_history_capacity().get();
    if capacity.get() > maximum {
        return Err(SessionCheckpointResourceLimit::HistoryCapacity {
            actual: capacity.get(),
            maximum,
        }
        .into());
    }
    Ok(())
}

pub(crate) fn validate_encoding_operation_count(
    entry_index: u64,
    actual: u64,
    context: &EditorContext,
) -> Result<(), SessionCheckpointCodecError> {
    if actual == 0 {
        return Err(SessionCheckpointTopologyError::EmptyEntryOperations { entry_index }.into());
    }
    let maximum = context.max_operations_per_transaction();
    if actual > u64::from(maximum) {
        return Err(SessionCheckpointResourceLimit::EntryOperations {
            entry_index,
            actual,
            maximum,
        }
        .into());
    }
    Ok(())
}

pub(crate) fn validate_cursor(
    cursor: u32,
    entry_count: u64,
) -> Result<(), SessionCheckpointCodecError> {
    if u64::from(cursor) > entry_count {
        return Err(SessionCheckpointTopologyError::CursorOutOfBounds {
            cursor: u64::from(cursor),
            entries: entry_count,
        }
        .into());
    }
    Ok(())
}

pub(crate) fn validate_open_group_topology(
    has_open_group: bool,
    cursor: u32,
    entry_count: u64,
) -> Result<(), SessionCheckpointCodecError> {
    if !has_open_group {
        return Ok(());
    }
    if cursor == 0 {
        return Err(SessionCheckpointTopologyError::OpenMergeGroupWithoutUndo.into());
    }
    if u64::from(cursor) != entry_count {
        return Err(SessionCheckpointTopologyError::OpenMergeGroupWithRedo {
            cursor: u64::from(cursor),
            entries: entry_count,
        }
        .into());
    }
    Ok(())
}

pub(crate) fn history_entries_preflight_error(
    error: SessionHistoryEntriesPreflightError,
) -> SessionCheckpointCodecError {
    match error {
        SessionHistoryEntriesPreflightError::Json(source) => {
            SessionCheckpointCodecError::InvalidJson(source)
        }
        SessionHistoryEntriesPreflightError::EntryJson { entry_index, source } => {
            SessionCheckpointCodecError::InvalidEntryJson { entry_index, source }
        }
        SessionHistoryEntriesPreflightError::EntryLimit { actual, maximum } => {
            SessionCheckpointTopologyError::EntryCountExceedsCapacity { actual, capacity: maximum }
                .into()
        }
        SessionHistoryEntriesPreflightError::EmptyOperations { entry_index } => {
            SessionCheckpointTopologyError::EmptyEntryOperations { entry_index }.into()
        }
        SessionHistoryEntriesPreflightError::Operations { entry_index, source } => {
            history_operation_error(entry_index, source)
        }
        SessionHistoryEntriesPreflightError::AggregateOperationLimit { actual, maximum } => {
            SessionCheckpointResourceLimit::AggregateForwardOperations { actual, maximum }.into()
        }
        SessionHistoryEntriesPreflightError::AggregateOperationOverflow => {
            SessionCheckpointResourceLimit::AggregateForwardOperationsOverflow.into()
        }
    }
}

fn history_operation_error(
    entry_index: u64,
    error: OperationSequenceDecodeError,
) -> SessionCheckpointCodecError {
    match error {
        OperationSequenceDecodeError::Json(source) => {
            SessionCheckpointCodecError::InvalidEntryJson { entry_index, source }
        }
        OperationSequenceDecodeError::Limit(error) => {
            history_operation_limit_error(entry_index, error)
        }
        OperationSequenceDecodeError::OperationJson { operation_index, source } => {
            SessionCheckpointCodecError::InvalidOperationJson {
                entry_index,
                operation_index,
                source,
            }
        }
        OperationSequenceDecodeError::OperationRecord { operation_index, source } => {
            SessionCheckpointCodecError::InvalidOperation { entry_index, operation_index, source }
        }
        OperationSequenceDecodeError::OperationValidation(error) => {
            history_operation_validation_error(entry_index, error)
        }
    }
}

const fn history_operation_limit_error(
    entry_index: u64,
    error: OperationSequenceLimitError,
) -> SessionCheckpointCodecError {
    SessionCheckpointCodecError::ResourceLimit(SessionCheckpointResourceLimit::EntryOperations {
        entry_index,
        actual: error.actual,
        maximum: error.maximum,
    })
}

pub(crate) fn history_operation_validation_error(
    entry_index: u64,
    error: IndexedOperationValidationError,
) -> SessionCheckpointCodecError {
    SessionCheckpointCodecError::OperationValidation {
        entry_index,
        operation_index: error.operation_index,
        source: error.source,
    }
}

fn session_record_error_from_editor_value(
    error: &EditorValueRecordError,
    entry_index: u64,
) -> SessionCheckpointCodecError {
    let (code, location) = match error {
        EditorValueRecordError::InvalidSelectionPath { endpoint, .. } => (
            SessionCheckpointRecordErrorCode::InvalidSelectionPath,
            match endpoint {
                SelectionEndpoint::Anchor => {
                    SessionCheckpointRecordLocation::EntryResultSelectionAnchor { entry_index }
                }
                SelectionEndpoint::Focus => {
                    SessionCheckpointRecordLocation::EntryResultSelectionFocus { entry_index }
                }
            },
        ),
        EditorValueRecordError::InvalidPendingFormatName { format_index, .. } => (
            SessionCheckpointRecordErrorCode::InvalidQualifiedName,
            SessionCheckpointRecordLocation::EntryResultPendingFormat {
                entry_index,
                format_index: *format_index,
            },
        ),
        EditorValueRecordError::PendingFormatLimit { .. } => (
            SessionCheckpointRecordErrorCode::PendingFormatLimit,
            SessionCheckpointRecordLocation::EntryResultPendingFormats { entry_index },
        ),
        EditorValueRecordError::NonCanonicalPendingFormats { format_index, .. } => (
            SessionCheckpointRecordErrorCode::NonCanonicalPendingFormats,
            SessionCheckpointRecordLocation::EntryResultPendingFormat {
                entry_index,
                format_index: *format_index,
            },
        ),
        EditorValueRecordError::PendingFormatNotAllowed { format_index }
        | EditorValueRecordError::PendingFormatPropertiesNotAllowed { format_index } => (
            SessionCheckpointRecordErrorCode::PendingFormatNotAllowed,
            SessionCheckpointRecordLocation::EntryResultPendingFormat {
                entry_index,
                format_index: *format_index,
            },
        ),
    };
    SessionCheckpointRecordError::new(code, location, error.to_string()).into()
}

#[derive(Default)]
pub(crate) struct RetainedBoundaryBudget {
    nodes: u64,
    text_bytes: u64,
    property_values: u64,
    property_string_bytes: u64,
}

impl RetainedBoundaryBudget {
    pub(crate) fn observe(
        &mut self,
        summary: &crate::document::DocumentSummary,
        boundary_index: u64,
        limits: &SessionCheckpointLimits,
    ) -> Result<(), SessionCheckpointCodecError> {
        self.observe_with_additional_properties(summary, 0, 0, boundary_index, limits)
    }

    /// Accounts for one complete retained V3 editor-state boundary.
    ///
    /// Pending formats are state outside the document AST, so their properties
    /// must be added to (rather than substituted for) the document summary.
    /// Computing the combined per-boundary increments before observation keeps
    /// the established nodes, text, property-values, property-string-bytes
    /// rejection order and counts the document exactly once.
    pub(crate) fn observe_state(
        &mut self,
        state: &EditorState,
        boundary_index: u64,
        limits: &SessionCheckpointLimits,
    ) -> Result<(), SessionCheckpointCodecError> {
        let mut pending_property_values = 0_u64;
        let mut pending_property_string_bytes = 0_u64;
        if let Some(formats) = state.pending_formats() {
            for format in formats {
                let summary = state
                    .context()
                    .schema()
                    .validate_inline_format_instance(state.context().limits(), format)
                    .map_err(|report| {
                        runtime_invariant(format!(
                            "validated retained pending format failed schema admission with {} issue(s)",
                            report.issue_count()
                        ))
                    })?;
                pending_property_values = pending_property_values
                    .checked_add(summary.property_value_count())
                    .ok_or(SessionCheckpointResourceLimit::RetainedOverflow {
                        kind: RetainedResourceKind::PropertyValues,
                        boundary_index,
                    })?;
                pending_property_string_bytes = pending_property_string_bytes
                    .checked_add(summary.property_string_bytes())
                    .ok_or(SessionCheckpointResourceLimit::RetainedOverflow {
                        kind: RetainedResourceKind::PropertyStringBytes,
                        boundary_index,
                    })?;
            }
        }
        self.observe_with_additional_properties(
            state.document().summary(),
            pending_property_values,
            pending_property_string_bytes,
            boundary_index,
            limits,
        )
    }

    fn observe_with_additional_properties(
        &mut self,
        summary: &crate::document::DocumentSummary,
        additional_property_values: u64,
        additional_property_string_bytes: u64,
        boundary_index: u64,
        limits: &SessionCheckpointLimits,
    ) -> Result<(), SessionCheckpointCodecError> {
        self.nodes = checked_retained_add(
            RetainedResourceKind::Nodes,
            boundary_index,
            self.nodes,
            summary.node_count(),
        )?;
        check_retained_limit(
            RetainedResourceKind::Nodes,
            boundary_index,
            self.nodes,
            limits.max_retained_nodes(),
        )?;
        self.text_bytes = checked_retained_add(
            RetainedResourceKind::TextBytes,
            boundary_index,
            self.text_bytes,
            summary.total_text_bytes(),
        )?;
        check_retained_limit(
            RetainedResourceKind::TextBytes,
            boundary_index,
            self.text_bytes,
            limits.max_retained_text_bytes(),
        )?;
        let boundary_property_values = summary
            .property_value_count()
            .checked_add(additional_property_values)
            .ok_or(SessionCheckpointResourceLimit::RetainedOverflow {
                kind: RetainedResourceKind::PropertyValues,
                boundary_index,
            })?;
        self.property_values = checked_retained_add(
            RetainedResourceKind::PropertyValues,
            boundary_index,
            self.property_values,
            boundary_property_values,
        )?;
        check_retained_limit(
            RetainedResourceKind::PropertyValues,
            boundary_index,
            self.property_values,
            limits.max_retained_property_values(),
        )?;
        let boundary_property_string_bytes = summary
            .total_property_string_bytes()
            .checked_add(additional_property_string_bytes)
            .ok_or(SessionCheckpointResourceLimit::RetainedOverflow {
                kind: RetainedResourceKind::PropertyStringBytes,
                boundary_index,
            })?;
        self.property_string_bytes = checked_retained_add(
            RetainedResourceKind::PropertyStringBytes,
            boundary_index,
            self.property_string_bytes,
            boundary_property_string_bytes,
        )?;
        check_retained_limit(
            RetainedResourceKind::PropertyStringBytes,
            boundary_index,
            self.property_string_bytes,
            limits.max_retained_property_string_bytes(),
        )
    }
}

fn checked_retained_add(
    kind: RetainedResourceKind,
    boundary_index: u64,
    current: u64,
    increment: u64,
) -> Result<u64, SessionCheckpointCodecError> {
    current.checked_add(increment).ok_or_else(|| {
        SessionCheckpointResourceLimit::RetainedOverflow { kind, boundary_index }.into()
    })
}

fn check_retained_limit(
    kind: RetainedResourceKind,
    boundary_index: u64,
    actual: u64,
    maximum: u64,
) -> Result<(), SessionCheckpointCodecError> {
    if actual > maximum {
        return Err(SessionCheckpointResourceLimit::Retained {
            kind,
            boundary_index,
            actual,
            maximum,
        }
        .into());
    }
    Ok(())
}

pub(crate) fn same_semantic_state(left: &EditorState, right: &EditorState) -> bool {
    left.context() == right.context()
        && left.snapshot().lineage() == right.snapshot().lineage()
        && left.document() == right.document()
        && left.selection() == right.selection()
        && left.pending_formats() == right.pending_formats()
}

fn first_operation_mismatch(wire: &[Operation], applied: &[Operation]) -> Option<u64> {
    let shared = wire.len().min(applied.len());
    let mismatch =
        wire[..shared].iter().zip(&applied[..shared]).position(|(wire, applied)| wire != applied);
    mismatch.or((wire.len() != applied.len()).then_some(shared)).map(usize_to_u64)
}

pub(crate) fn history_assembly_error(
    error: HistoryCheckpointInvariantError,
) -> SessionCheckpointCodecError {
    runtime_invariant(format!("proved session history could not be assembled: {error:?}"))
}

pub(crate) fn runtime_invariant(
    diagnostic: impl Into<BoundedDiagnostic>,
) -> SessionCheckpointCodecError {
    SessionCheckpointCodecError::RuntimeInvariant { diagnostic: diagnostic.into() }
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}
