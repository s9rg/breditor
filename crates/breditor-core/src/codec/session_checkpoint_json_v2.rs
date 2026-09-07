use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    codec::{
        BoundedDiagnostic, JsonFailure, SessionCheckpointCodecError, SessionCheckpointLimits,
        SessionCheckpointRecordError, SessionCheckpointRecordErrorCode,
        SessionCheckpointRecordLocation, SessionCheckpointTopologyError,
    },
    identity::QualifiedName,
    record::DecimalU64Record,
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion,
        require_schema_fingerprint, require_schema_id,
    },
    session::{EditorSession, EditorSessionCheckpointParts},
    state::{EditorContext, Revision},
};

use super::{
    editor_state_encoding_v2::EditorStateEncodingV2,
    editor_state_json::EDITOR_STATE_FORMAT,
    editor_state_json_v2::{EDITOR_STATE_V2_FORMAT_VERSION, EditorStateJsonCodecV2},
    editor_state_v2_error::EditorStateV2CodecError,
    json_size::JsonByteCounter,
    session_checkpoint_encoding_v2::SessionCheckpointEncodingV2,
    session_checkpoint_entries_v1::{
        count_session_history_entries, preflight_session_history_entries,
    },
    session_checkpoint_json::{
        SESSION_CHECKPOINT_FORMAT, SessionCheckpointJsonCodec, SessionHistoryEntryEncoding,
        decode_history_capacity, history_assembly_error, history_entries_preflight_error,
        history_operation_validation_error, runtime_invariant, same_semantic_state,
        validate_capacity_policy, validate_cursor, validate_open_group_topology,
    },
    session_checkpoint_v2_error::SessionCheckpointV2CodecError,
};

/// Wire version accepted and emitted by [`SessionCheckpointJsonCodecV2`].
pub const SESSION_CHECKPOINT_V2_FORMAT_VERSION: u32 = 2;

/// Strict JSON codec for fingerprint-bearing bounded-session checkpoints.
#[derive(Clone, Debug)]
pub struct SessionCheckpointJsonCodecV2 {
    context: EditorContext,
    limits: SessionCheckpointLimits,
    state_codec: EditorStateJsonCodecV2,
    replay_codec: SessionCheckpointJsonCodec,
}

impl SessionCheckpointJsonCodecV2 {
    /// Creates a V2 codec with conservative default aggregate-history limits.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let limits = SessionCheckpointLimits::default();
        let state_codec = EditorStateJsonCodecV2::new(context.clone());
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

    /// Strictly decodes and replay-proves one complete Session Checkpoint V2 value.
    ///
    /// The outer binding and nested history-base binding are independently
    /// admitted. History recipes are preflighted before allocation and replayed
    /// in both directions before any session is published.
    ///
    /// # Errors
    ///
    /// Returns [`SessionCheckpointV2CodecError`] for malformed or mismatched
    /// bindings, mixed generations, invalid topology or values, resource-limit
    /// excess, replay failure, or impossible checked assembly.
    pub fn decode(&self, json: &str) -> Result<EditorSession, SessionCheckpointV2CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(SessionCheckpointV2CodecError::InputTooLarge {
                actual: json.len(),
                maximum,
            });
        }

        let header: BorrowedSessionCheckpointHeader<'_> = decode_json(json)?;
        if header.format != SESSION_CHECKPOINT_FORMAT {
            return Err(SessionCheckpointV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: SESSION_CHECKPOINT_FORMAT,
            });
        }
        if header.format_version != SESSION_CHECKPOINT_V2_FORMAT_VERSION {
            return Err(SessionCheckpointV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: SESSION_CHECKPOINT_V2_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedSessionCheckpointRecordV2<'_> = decode_json(json)?;
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

        let preflighted_entries = preflight_session_history_entries(
            envelope.entries.get(),
            &self.context,
            entry_count,
            self.limits.max_aggregate_forward_operations(),
        )
        .map_err(history_entries_preflight_error)
        .map_err(checkpoint_error)?;

        validate_history_base_header(envelope.history_base)?;
        let history_base = self
            .state_codec
            .decode(envelope.history_base.get())
            .map_err(|error| SessionCheckpointV2CodecError::InvalidHistoryBase(Box::new(error)))?;
        if history_base.snapshot().revision() != Revision::ZERO {
            return Err(checkpoint_error(
                SessionCheckpointCodecError::NonZeroHistoryBaseRevision {
                    actual: history_base.snapshot().revision(),
                },
            ));
        }

        let (entries, current_boundary) = self
            .replay_codec
            .decode_history_chain(&history_base, preflighted_entries, envelope.cursor)
            .map_err(checkpoint_error)?;
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

    /// Encodes one exactly context-bound session as deterministic compact V2 JSON.
    ///
    /// # Errors
    ///
    /// Returns [`SessionCheckpointV2CodecError`] for context mismatch,
    /// resource or topology failure, an invalid retained recipe, serialization
    /// failure, or output exceeding the decode byte budget.
    pub fn encode(&self, session: &EditorSession) -> Result<String, SessionCheckpointV2CodecError> {
        let EditorSessionCheckpointParts { state, history } = session.checkpoint_parts();
        if state.context() != &self.context {
            return Err(SessionCheckpointV2CodecError::ContextConfigurationMismatch);
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
            return Err(SessionCheckpointV2CodecError::ContextConfigurationMismatch);
        }
        if history_base_source.snapshot().lineage() != state.snapshot().lineage() {
            return Err(checkpoint_error(runtime_invariant(
                "session history base and current state use different lineages",
            )));
        }
        let history_base = history_base_source.with_checkpoint_revision(Revision::ZERO);
        let history_base_encoding = EditorStateEncodingV2::try_new(&history_base)
            .map_err(|error| {
                super::editor_state_json_v2::editor_state_record_error_from_editor_value(&error)
            })
            .map_err(EditorStateV2CodecError::InvalidEditorState)
            .map_err(|error| SessionCheckpointV2CodecError::InvalidHistoryBase(Box::new(error)))?;

        let encoded_entries = self
            .replay_codec
            .encode_history_entries(history_base_source, &entries)
            .map_err(checkpoint_error)?;

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

        let record = SessionCheckpointEncodingV2 {
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

    fn serialize_record(
        &self,
        record: &SessionCheckpointEncodingV2<'_, Vec<SessionHistoryEntryEncoding<'_>>>,
    ) -> Result<String, SessionCheckpointV2CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, record);
        if byte_counter.exceeded() {
            return Err(SessionCheckpointV2CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        for (entry_index, entry) in record.entries.iter().enumerate() {
            if let Some(error) = entry.forward_operations.take_validation_error() {
                let entry_index = u64::try_from(entry_index).unwrap_or(u64::MAX);
                return Err(checkpoint_error(history_operation_validation_error(
                    entry_index,
                    error,
                )));
            }
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(SessionCheckpointV2CodecError::Encoding)?;
        serde_json::to_string(record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(SessionCheckpointV2CodecError::Encoding)
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
struct BorrowedSessionCheckpointRecordV2<'a> {
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

fn decode_json<'de, T>(json: &'de str) -> Result<T, SessionCheckpointV2CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(SessionCheckpointV2CodecError::InvalidJson)
}

fn decode_raw<'de, T>(raw: &'de RawValue) -> Result<T, SessionCheckpointV2CodecError>
where
    T: Deserialize<'de>,
{
    decode_json(raw.get())
}

fn decode_and_admit_binding(
    envelope: &BorrowedSessionCheckpointRecordV2<'_>,
    compiled: &crate::schema::CompiledSchema,
) -> Result<DurableSchemaBinding, SessionCheckpointV2CodecError> {
    let name = QualifiedName::try_new(envelope.schema.name.as_ref()).map_err(|source| {
        SessionCheckpointV2CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(envelope.schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(envelope.schema.version).map_err(|source| {
        SessionCheckpointV2CodecError::InvalidSchemaVersion {
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

fn validate_history_base_header(raw: &RawValue) -> Result<(), SessionCheckpointV2CodecError> {
    let header: BorrowedHistoryBaseHeader<'_> = serde_json::from_str(raw.get())
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(EditorStateV2CodecError::InvalidJson)
        .map_err(|error| SessionCheckpointV2CodecError::InvalidHistoryBase(Box::new(error)))?;
    if header.format != EDITOR_STATE_FORMAT {
        return Err(SessionCheckpointV2CodecError::InvalidHistoryBase(Box::new(
            EditorStateV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: EDITOR_STATE_FORMAT,
            },
        )));
    }
    if header.format_version != EDITOR_STATE_V2_FORMAT_VERSION {
        return Err(SessionCheckpointV2CodecError::InvalidHistoryBase(Box::new(
            EditorStateV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: EDITOR_STATE_V2_FORMAT_VERSION,
            },
        )));
    }
    Ok(())
}

fn checkpoint_error(error: SessionCheckpointCodecError) -> SessionCheckpointV2CodecError {
    SessionCheckpointV2CodecError::InvalidCheckpoint(Box::new(error))
}
