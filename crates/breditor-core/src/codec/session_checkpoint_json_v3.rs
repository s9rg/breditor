//! Lossless, replay-proved session checkpoints for typed inline formats.

use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, JsonFailure, SessionCheckpointCodecError, SessionCheckpointLimits,
        SessionCheckpointRecordError, SessionCheckpointRecordErrorCode,
        SessionCheckpointRecordLocation, SessionCheckpointResourceLimit,
        SessionCheckpointTopologyError,
    },
    identity::QualifiedName,
    record::{
        DecimalU64Record, PendingFormatRecordV2, SelectionRecordV1, SessionHistoryEntryRecordV2,
    },
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion,
        require_schema_fingerprint, require_schema_id,
    },
    session::{EditorSession, EditorSessionCheckpointParts, HistoryEntry},
    state::{EditorContext, EditorState, Revision},
};

use super::{
    EditorStateV3CodecError, EditorStateV3PendingFormatError, SessionCheckpointV3CodecError,
    editor_state_encoding_v3::EditorStateEncodingV3,
    editor_state_json::EDITOR_STATE_FORMAT,
    editor_state_json_v3::{EDITOR_STATE_V3_FORMAT_VERSION, EditorStateJsonCodecV3},
    editor_value_payload_v1::{decode_selection_record_v1, encode_selection_record_v1},
    editor_value_payload_v2::{
        EditorValueRecordV2Error, EditorValueRecordV2ErrorCode, decode_pending_format_records_v2,
        encode_pending_format_records_v2,
    },
    json_size::JsonByteCounter,
    operation_sequence_v1::{IndexedOperationValidationError, OperationSequenceLimitError},
    operation_sequence_v2::{
        OperationSequenceDecodeErrorV2, OperationSequenceEncodingV2, decode_operation_sequence_v2,
    },
    session_checkpoint_encoding_v3::SessionCheckpointEncodingV3,
    session_checkpoint_entries_v1::count_session_history_entries,
    session_checkpoint_entries_v2::{
        BorrowedSessionHistoryEntryRecordV2, PreflightedSessionHistoryEntryV2,
        SessionHistoryEntriesPreflightErrorV2, preflight_session_history_entries_v2,
    },
    session_checkpoint_json::{
        RetainedBoundaryBudget, SESSION_CHECKPOINT_FORMAT, SessionCheckpointJsonCodec,
        decode_history_capacity, history_assembly_error, history_entries_preflight_error,
        runtime_invariant, same_semantic_state, validate_capacity_policy, validate_cursor,
        validate_encoding_operation_count, validate_open_group_topology,
    },
};

type SessionHistoryEntryEncodingV2<'a> =
    SessionHistoryEntryRecordV2<OperationSequenceEncodingV2<'a>>;

/// Wire version accepted and emitted by [`SessionCheckpointJsonCodecV3`].
pub const SESSION_CHECKPOINT_V3_FORMAT_VERSION: u32 = 3;

/// Strict JSON codec for a complete property-aware undo/redo session.
///
/// The wire stores only chronological forward recipes. Decode reconstructs
/// each boundary and proves its locally derived inverse before admitting the
/// resulting session, so serialized data cannot assert its own undo behavior.
#[derive(Clone, Debug)]
pub struct SessionCheckpointJsonCodecV3 {
    context: EditorContext,
    limits: SessionCheckpointLimits,
    state_codec: EditorStateJsonCodecV3,
    replay_codec: SessionCheckpointJsonCodec,
}

impl SessionCheckpointJsonCodecV3 {
    /// Creates a V3 codec with conservative default aggregate-history limits.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let limits = SessionCheckpointLimits::default();
        let state_codec = EditorStateJsonCodecV3::new(context.clone());
        let replay_codec = SessionCheckpointJsonCodec::new(context.clone()).with_limits(limits);
        Self { context, limits, state_codec, replay_codec }
    }

    /// Replaces the host-authoritative aggregate-history admission policy.
    #[must_use]
    pub fn with_limits(mut self, limits: SessionCheckpointLimits) -> Self {
        self.replay_codec = self.replay_codec.with_limits(limits);
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

    /// Strictly decodes and bidirectionally replay-proves one complete checkpoint.
    ///
    /// # Errors
    ///
    /// Returns [`SessionCheckpointV3CodecError`] for malformed or mismatched
    /// bindings, invalid topology or typed values, exceeded resource limits,
    /// failed forward/inverse replay, or impossible checked assembly.
    pub fn decode(&self, json: &str) -> Result<EditorSession, SessionCheckpointV3CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(SessionCheckpointV3CodecError::InputTooLarge {
                actual: json.len(),
                maximum,
            });
        }

        let header: BorrowedSessionCheckpointHeader<'_> = decode_json(json)?;
        if header.format != SESSION_CHECKPOINT_FORMAT {
            return Err(SessionCheckpointV3CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: SESSION_CHECKPOINT_FORMAT,
            });
        }
        if header.format_version != SESSION_CHECKPOINT_V3_FORMAT_VERSION {
            return Err(SessionCheckpointV3CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: SESSION_CHECKPOINT_V3_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedSessionCheckpointRecordV3<'_> = decode_json(json)?;
        let _binding = decode_and_admit_binding(&envelope, self.context.schema())?;

        let capacity = decode_history_capacity(envelope.history_capacity, &self.limits)
            .map_err(checkpoint_error)?;
        let entry_count = count_session_history_entries(envelope.entries.get(), capacity.get())
            .map_err(history_entries_preflight_error)
            .map_err(checkpoint_error)?;
        validate_cursor(envelope.cursor, entry_count).map_err(checkpoint_error)?;

        let open_group_record: Option<Cow<'_, str>> = decode_raw(envelope.open_merge_group)?;
        validate_open_group_topology(open_group_record.is_some(), envelope.cursor, entry_count)
            .map_err(checkpoint_error)?;

        let current_revision = DecimalU64Record::try_from_decimal(
            envelope.current_revision.as_ref(),
        )
        .map_err(|error| {
            checkpoint_error(
                SessionCheckpointRecordError::new(
                    SessionCheckpointRecordErrorCode::InvalidCurrentRevision,
                    SessionCheckpointRecordLocation::CurrentRevision,
                    error.to_string(),
                )
                .into(),
            )
        })?;
        let open_merge_group = open_group_record
            .map(|group| {
                QualifiedName::try_from(group.into_owned()).map_err(|error| {
                    checkpoint_error(
                        SessionCheckpointRecordError::new(
                            SessionCheckpointRecordErrorCode::InvalidQualifiedName,
                            SessionCheckpointRecordLocation::OpenMergeGroup,
                            error.to_string(),
                        )
                        .into(),
                    )
                })
            })
            .transpose()?;

        let preflighted_entries = preflight_session_history_entries_v2(
            envelope.entries.get(),
            &self.context,
            entry_count,
            self.limits.max_aggregate_forward_operations(),
        )
        .map_err(history_entries_preflight_error_v2)
        .map_err(checkpoint_error)?;

        validate_history_base_header(envelope.history_base)?;
        let history_base = self
            .state_codec
            .decode(envelope.history_base.get())
            .map_err(|error| SessionCheckpointV3CodecError::InvalidHistoryBase(Box::new(error)))?;
        if history_base.snapshot().revision() != Revision::ZERO {
            return Err(checkpoint_error(
                SessionCheckpointCodecError::NonZeroHistoryBaseRevision {
                    actual: history_base.snapshot().revision(),
                },
            ));
        }

        let (entries, current_boundary) =
            self.decode_history_chain_v2(&history_base, preflighted_entries, envelope.cursor)?;
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
        .map_err(checkpoint_error)
    }

    /// Encodes one exactly context-bound session as deterministic compact V3 JSON.
    ///
    /// # Errors
    ///
    /// Returns [`SessionCheckpointV3CodecError`] for context mismatch, invalid
    /// retained recipes, topology/resource failure, serialization failure, or
    /// output exceeding the same codec's decode byte budget.
    pub fn encode(&self, session: &EditorSession) -> Result<String, SessionCheckpointV3CodecError> {
        let EditorSessionCheckpointParts { state, history } = session.checkpoint_parts();
        if state.context() != &self.context {
            return Err(SessionCheckpointV3CodecError::ContextConfigurationMismatch);
        }
        validate_capacity_policy(history.capacity, &self.limits).map_err(checkpoint_error)?;
        if history.entry_count > history.capacity.get() {
            return Err(checkpoint_error(
                SessionCheckpointTopologyError::EntryCountExceedsCapacity {
                    actual: u64::from(history.entry_count),
                    capacity: history.capacity.get(),
                }
                .into(),
            ));
        }
        if history.cursor > history.entry_count {
            return Err(checkpoint_error(
                SessionCheckpointTopologyError::CursorOutOfBounds {
                    cursor: u64::from(history.cursor),
                    entries: u64::from(history.entry_count),
                }
                .into(),
            ));
        }
        validate_open_group_topology(
            history.open_merge_group.is_some(),
            history.cursor,
            u64::from(history.entry_count),
        )
        .map_err(checkpoint_error)?;

        let entries = history.entries.collect::<Vec<_>>();
        if entries.len() != history.entry_count as usize {
            return Err(checkpoint_error(runtime_invariant(
                "session history entry iterator length disagrees with its fixed-width count",
            )));
        }
        let history_base_source =
            entries.first().map_or(state, |entry| entry.checkpoint_parts().before);
        if history_base_source.context() != &self.context {
            return Err(SessionCheckpointV3CodecError::ContextConfigurationMismatch);
        }
        if history_base_source.snapshot().lineage() != state.snapshot().lineage() {
            return Err(checkpoint_error(runtime_invariant(
                "session history base and current state use different lineages",
            )));
        }
        let history_base = history_base_source.with_checkpoint_revision(Revision::ZERO);
        let history_base_encoding = EditorStateEncodingV3::try_new(&history_base)
            .map_err(|error| {
                EditorStateV3CodecError::InvalidPendingFormats(
                    EditorStateV3PendingFormatError::from_editor_value(&error),
                )
            })
            .map_err(|error| SessionCheckpointV3CodecError::InvalidHistoryBase(Box::new(error)))?;

        let encoded_entries = self.encode_history_entries_v2(history_base_source, &entries)?;

        let cursor_boundary = if history.cursor == 0 {
            history_base_source
        } else {
            let index = (history.cursor - 1) as usize;
            entries.get(index).map(|entry| entry.checkpoint_parts().after).ok_or_else(|| {
                checkpoint_error(runtime_invariant("session cursor boundary is absent"))
            })?
        };
        if !same_semantic_state(cursor_boundary, state) {
            return Err(checkpoint_error(runtime_invariant(
                "session current state disagrees with its logical history cursor boundary",
            )));
        }
        if let Some(redo_entry) = entries.get(history.cursor as usize)
            && !same_semantic_state(redo_entry.checkpoint_parts().before, state)
        {
            return Err(checkpoint_error(runtime_invariant(
                "session current state disagrees with its nearest redo boundary",
            )));
        }
        if history.open_merge_group.is_some() && cursor_boundary != state {
            return Err(checkpoint_error(runtime_invariant(
                "an open merge group does not end at the exact current editor state",
            )));
        }

        let record = SessionCheckpointEncodingV3 {
            context: &self.context,
            history_base: history_base_encoding,
            current_revision: DecimalU64Record::new(state.snapshot().revision().get()),
            history_capacity: history.capacity.get(),
            cursor: history.cursor,
            entries: encoded_entries,
            open_merge_group: history.open_merge_group.map(|group| group.as_str().to_owned()),
        };
        self.serialize_record(&record)
    }

    fn decode_history_chain_v2(
        &self,
        history_base: &EditorState,
        preflighted_entries: Vec<PreflightedSessionHistoryEntryV2<'_>>,
        cursor: u32,
    ) -> Result<(Vec<HistoryEntry>, EditorState), SessionCheckpointV3CodecError> {
        let mut retained = RetainedBoundaryBudget::default();
        retained.observe_state(history_base, 0, &self.limits).map_err(checkpoint_error)?;
        let mut boundary = history_base.clone();
        let mut current_boundary = (cursor == 0).then(|| history_base.clone());
        let mut entries = Vec::with_capacity(preflighted_entries.len());
        for (entry_index, preflight) in preflighted_entries.into_iter().enumerate() {
            let entry_index = usize_to_u64(entry_index);
            let record: BorrowedSessionHistoryEntryRecordV2<'_> =
                decode_entry_json(preflight.raw.get(), entry_index)?;
            let operations = decode_operation_sequence_v2(
                record.forward_operations.get(),
                &self.context,
                preflight.operations,
            )
            .map_err(|error| history_operation_error_v2(entry_index, error))
            .map_err(checkpoint_error)?;
            let result_selection_record: Option<SelectionRecordV1> =
                decode_entry_raw(record.result_selection, entry_index)?;
            let result_selection = result_selection_record
                .map(decode_selection_record_v1)
                .transpose()
                .map_err(|error| session_record_error_from_editor_value(&error, entry_index))
                .map_err(checkpoint_error)?;
            let result_pending_records: Option<Vec<PendingFormatRecordV2>> =
                decode_entry_raw(record.result_pending_formats, entry_index)?;
            let result_pending_formats = result_pending_records
                .map(|records| decode_pending_format_records_v2(records, &self.context))
                .transpose()
                .map_err(|error| session_record_error_from_editor_value_v2(&error, entry_index))
                .map_err(checkpoint_error)?;

            let (entry, after) = self
                .replay_codec
                .prove_entry(
                    entry_index,
                    &boundary,
                    operations,
                    result_selection,
                    result_pending_formats,
                )
                .map_err(checkpoint_error)?;
            retained
                .observe_state(&after, entry_index.saturating_add(1), &self.limits)
                .map_err(checkpoint_error)?;
            if u64::from(cursor) == entry_index.saturating_add(1) {
                current_boundary = Some(after.clone());
            }
            entries.push(entry);
            boundary = after;
        }

        let current_boundary = current_boundary.ok_or_else(|| {
            checkpoint_error(runtime_invariant(
                "validated session cursor did not identify a chronological boundary",
            ))
        })?;
        Ok((entries, current_boundary))
    }

    fn encode_history_entries_v2<'a>(
        &'a self,
        history_base: &'a EditorState,
        entries: &[&'a HistoryEntry],
    ) -> Result<Vec<SessionHistoryEntryEncodingV2<'a>>, SessionCheckpointV3CodecError> {
        let normalized_base = history_base.with_checkpoint_revision(Revision::ZERO);
        let mut retained = RetainedBoundaryBudget::default();
        retained.observe_state(&normalized_base, 0, &self.limits).map_err(checkpoint_error)?;
        let mut aggregate_operations = 0_u64;
        let mut previous = history_base;
        let mut encoded_entries = Vec::with_capacity(entries.len());
        for (entry_index, entry) in entries.iter().enumerate() {
            let entry_index = usize_to_u64(entry_index);
            let parts = entry.checkpoint_parts();
            if !same_semantic_state(previous, parts.before) {
                return Err(checkpoint_error(runtime_invariant(format!(
                    "session history entry {entry_index} is disconnected from its predecessor"
                ))));
            }
            if parts.before.context() != &self.context || parts.after.context() != &self.context {
                return Err(checkpoint_error(
                    SessionCheckpointCodecError::ContextConfigurationMismatch,
                ));
            }
            let lineage = history_base.snapshot().lineage();
            if parts.before.snapshot().lineage() != lineage
                || parts.after.snapshot().lineage() != lineage
            {
                return Err(checkpoint_error(runtime_invariant(format!(
                    "session history entry {entry_index} changes the fixed session lineage"
                ))));
            }
            let operation_count = usize_to_u64(parts.forward_operations.len());
            validate_encoding_operation_count(entry_index, operation_count, &self.context)
                .map_err(checkpoint_error)?;
            if parts.inverse_operations.len() != parts.forward_operations.len() {
                return Err(checkpoint_error(runtime_invariant(format!(
                    "session history entry {entry_index} has unequal forward and inverse recipes"
                ))));
            }
            aggregate_operations =
                aggregate_operations.checked_add(operation_count).ok_or_else(|| {
                    checkpoint_error(
                        SessionCheckpointResourceLimit::AggregateForwardOperationsOverflow.into(),
                    )
                })?;
            let aggregate_maximum = self.limits.max_aggregate_forward_operations();
            if aggregate_operations > aggregate_maximum {
                return Err(checkpoint_error(
                    SessionCheckpointResourceLimit::AggregateForwardOperations {
                        actual: aggregate_operations,
                        maximum: aggregate_maximum,
                    }
                    .into(),
                ));
            }
            retained
                .observe_state(parts.after, entry_index.saturating_add(1), &self.limits)
                .map_err(checkpoint_error)?;
            let result_pending_formats = parts
                .after
                .pending_formats()
                .map(|formats| encode_pending_format_records_v2(formats, &self.context))
                .transpose()
                .map_err(|error| session_record_error_from_editor_value_v2(&error, entry_index))
                .map_err(checkpoint_error)?;
            encoded_entries.push(SessionHistoryEntryRecordV2 {
                forward_operations: OperationSequenceEncodingV2::new(
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
        record: &SessionCheckpointEncodingV3<'_, Vec<SessionHistoryEntryEncodingV2<'_>>>,
    ) -> Result<String, SessionCheckpointV3CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, record);
        if byte_counter.exceeded() {
            return Err(SessionCheckpointV3CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        for (entry_index, entry) in record.entries.iter().enumerate() {
            if let Some(error) = entry.forward_operations.take_validation_error() {
                return Err(checkpoint_error(history_operation_validation_error_v2(
                    usize_to_u64(entry_index),
                    error,
                )));
            }
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(SessionCheckpointV3CodecError::Encoding)?;
        serde_json::to_string(record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(SessionCheckpointV3CodecError::Encoding)
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
#[serde(deny_unknown_fields)]
struct BorrowedSchemaIdRecord<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedSessionCheckpointRecordV3<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: BorrowedSchemaIdRecord<'a>,
    #[serde(borrow)]
    schema_fingerprint: Cow<'a, str>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedHistoryBaseHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, SessionCheckpointV3CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(SessionCheckpointV3CodecError::InvalidJson)
}

fn decode_raw<'de, T>(raw: &'de RawValue) -> Result<T, SessionCheckpointV3CodecError>
where
    T: Deserialize<'de>,
{
    decode_json(raw.get())
}

fn decode_entry_json<'de, T>(
    json: &'de str,
    entry_index: u64,
) -> Result<T, SessionCheckpointV3CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json).map_err(|error| JsonFailure::from_serde(&error)).map_err(|source| {
        checkpoint_error(SessionCheckpointCodecError::InvalidEntryJson { entry_index, source })
    })
}

fn decode_entry_raw<'de, T>(
    raw: &'de RawValue,
    entry_index: u64,
) -> Result<T, SessionCheckpointV3CodecError>
where
    T: Deserialize<'de>,
{
    decode_entry_json(raw.get(), entry_index)
}

fn decode_and_admit_binding(
    envelope: &BorrowedSessionCheckpointRecordV3<'_>,
    compiled: &crate::schema::CompiledSchema,
) -> Result<DurableSchemaBinding, SessionCheckpointV3CodecError> {
    let name = QualifiedName::try_new(envelope.schema.name.as_ref()).map_err(|source| {
        SessionCheckpointV3CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(envelope.schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(envelope.schema.version).map_err(|source| {
        SessionCheckpointV3CodecError::InvalidSchemaVersion {
            value: envelope.schema.version,
            source,
        }
    })?;
    let schema = SchemaId::new(name, version);
    require_schema_id(compiled, &schema)?;
    let fingerprint = envelope.schema_fingerprint.parse::<SchemaFingerprint>()?;
    require_schema_fingerprint(compiled, fingerprint)?;
    Ok(DurableSchemaBinding::new(schema, fingerprint))
}

fn validate_history_base_header(raw: &RawValue) -> Result<(), SessionCheckpointV3CodecError> {
    let header: BorrowedHistoryBaseHeader<'_> = serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(EditorStateV3CodecError::InvalidJson)
        .map_err(|error| SessionCheckpointV3CodecError::InvalidHistoryBase(Box::new(error)))?;
    if header.format != EDITOR_STATE_FORMAT {
        return Err(SessionCheckpointV3CodecError::InvalidHistoryBase(Box::new(
            EditorStateV3CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: EDITOR_STATE_FORMAT,
            },
        )));
    }
    if header.format_version != EDITOR_STATE_V3_FORMAT_VERSION {
        return Err(SessionCheckpointV3CodecError::InvalidHistoryBase(Box::new(
            EditorStateV3CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: EDITOR_STATE_V3_FORMAT_VERSION,
            },
        )));
    }
    Ok(())
}

fn history_entries_preflight_error_v2(
    error: SessionHistoryEntriesPreflightErrorV2,
) -> SessionCheckpointCodecError {
    match error {
        SessionHistoryEntriesPreflightErrorV2::Json(source) => {
            SessionCheckpointCodecError::InvalidJson(source)
        }
        SessionHistoryEntriesPreflightErrorV2::EntryJson { entry_index, source } => {
            SessionCheckpointCodecError::InvalidEntryJson { entry_index, source }
        }
        SessionHistoryEntriesPreflightErrorV2::EmptyOperations { entry_index } => {
            SessionCheckpointTopologyError::EmptyEntryOperations { entry_index }.into()
        }
        SessionHistoryEntriesPreflightErrorV2::Operations { entry_index, source } => {
            history_operation_error_v2(entry_index, source)
        }
        SessionHistoryEntriesPreflightErrorV2::AggregateOperationLimit { actual, maximum } => {
            SessionCheckpointResourceLimit::AggregateForwardOperations { actual, maximum }.into()
        }
        SessionHistoryEntriesPreflightErrorV2::AggregateOperationOverflow => {
            SessionCheckpointResourceLimit::AggregateForwardOperationsOverflow.into()
        }
    }
}

fn history_operation_error_v2(
    entry_index: u64,
    error: OperationSequenceDecodeErrorV2,
) -> SessionCheckpointCodecError {
    match error {
        OperationSequenceDecodeErrorV2::Json(source) => {
            SessionCheckpointCodecError::InvalidEntryJson { entry_index, source }
        }
        OperationSequenceDecodeErrorV2::Limit(error) => {
            history_operation_limit_error_v2(entry_index, error)
        }
        OperationSequenceDecodeErrorV2::OperationJson { operation_index, source } => {
            SessionCheckpointCodecError::InvalidOperationJson {
                entry_index,
                operation_index,
                source,
            }
        }
        OperationSequenceDecodeErrorV2::OperationRecord { operation_index, source } => {
            SessionCheckpointCodecError::InvalidOperation { entry_index, operation_index, source }
        }
        OperationSequenceDecodeErrorV2::OperationValidation(error) => {
            history_operation_validation_error_v2(entry_index, error)
        }
    }
}

const fn history_operation_limit_error_v2(
    entry_index: u64,
    error: OperationSequenceLimitError,
) -> SessionCheckpointCodecError {
    SessionCheckpointCodecError::ResourceLimit(SessionCheckpointResourceLimit::EntryOperations {
        entry_index,
        actual: error.actual,
        maximum: error.maximum,
    })
}

fn history_operation_validation_error_v2(
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
    error: &super::editor_value_payload_v1::EditorValueRecordError,
    entry_index: u64,
) -> SessionCheckpointCodecError {
    use super::editor_value_payload_v1::{EditorValueRecordError, SelectionEndpoint};

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

fn session_record_error_from_editor_value_v2(
    error: &EditorValueRecordV2Error,
    entry_index: u64,
) -> SessionCheckpointCodecError {
    let code = match error.code() {
        EditorValueRecordV2ErrorCode::InvalidFormatName => {
            SessionCheckpointRecordErrorCode::InvalidQualifiedName
        }
        EditorValueRecordV2ErrorCode::InvalidPropertyName => {
            SessionCheckpointRecordErrorCode::InvalidPendingFormatPropertyName
        }
        EditorValueRecordV2ErrorCode::InvalidPropertyValue => {
            SessionCheckpointRecordErrorCode::InvalidPendingFormatPropertyValue
        }
        EditorValueRecordV2ErrorCode::InvalidFormatInstance => {
            SessionCheckpointRecordErrorCode::PendingFormatNotAllowed
        }
        EditorValueRecordV2ErrorCode::PendingFormatLimit => {
            SessionCheckpointRecordErrorCode::PendingFormatLimit
        }
        EditorValueRecordV2ErrorCode::NonCanonicalPendingFormats => {
            SessionCheckpointRecordErrorCode::NonCanonicalPendingFormats
        }
        EditorValueRecordV2ErrorCode::PropertyValueCountOverflow
        | EditorValueRecordV2ErrorCode::PropertyValueCountLimit => {
            SessionCheckpointRecordErrorCode::PendingFormatPropertyValueLimit
        }
        EditorValueRecordV2ErrorCode::PropertyStringBytesOverflow
        | EditorValueRecordV2ErrorCode::PropertyStringBytesLimit => {
            SessionCheckpointRecordErrorCode::PendingFormatPropertyStringBytesLimit
        }
    };
    let location = error.format_index().map_or(
        SessionCheckpointRecordLocation::EntryResultPendingFormats { entry_index },
        |format_index| SessionCheckpointRecordLocation::EntryResultPendingFormat {
            entry_index,
            format_index,
        },
    );
    SessionCheckpointRecordError::new(code, location, error.diagnostic_value().clone()).into()
}

fn checkpoint_error(error: SessionCheckpointCodecError) -> SessionCheckpointV3CodecError {
    SessionCheckpointV3CodecError::InvalidCheckpoint(Box::new(error))
}

fn usize_to_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}
