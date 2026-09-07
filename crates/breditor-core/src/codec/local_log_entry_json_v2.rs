use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    identity::QualifiedName,
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogEventKind, LocalLogId, LocalLogSequence,
        LocalSessionId, MAX_LOCAL_LOG_IDENTITY_BYTES, ReplayId,
    },
    record::{DecimalU64Record, DecimalU64RecordError, LocalLogEventRecordV1},
    schema::{
        DurableSchemaBinding, SchemaFingerprint, SchemaId, SchemaVersion, require_schema_binding,
        require_schema_fingerprint, require_schema_id,
    },
    state::EditorContext,
    transaction::Commit,
};

use super::{
    BoundedDiagnostic, COMMIT_FORMAT, COMMIT_V2_FORMAT_VERSION, CommitJsonCodecV2,
    CommitV2CodecError, JsonFailure, LOCAL_LOG_ENTRY_FORMAT, LocalLogCommitEventKind,
    LocalLogEntryRecordError, LocalLogEntryRecordErrorCode, LocalLogEntryRecordLocation,
    LocalLogEntryV2CodecError, json_size::JsonByteCounter,
    local_log_entry_encoding_v2::LocalLogEntryEncodingV2,
};

/// Wire version accepted and emitted by [`LocalLogEntryJsonCodecV2`].
pub const LOCAL_LOG_ENTRY_V2_FORMAT_VERSION: u32 = 2;

const MAX_IDENTITY_STRING_JSON_BYTES: usize = 6 * MAX_LOCAL_LOG_IDENTITY_BYTES + 2;
const MAX_DECIMAL_U64_STRING_JSON_BYTES: usize = 6 * 20 + 2;

const _: () = assert!(COMMIT_V2_FORMAT_VERSION == 2);

/// Strict codec for one fingerprint-bound ordered local-session event.
///
/// The outer binding is retained on every decoded [`LocalLogEntry`], including
/// control-only events. Commit, undo, and redo events embed Commit V2 exactly;
/// V1 commits are never accepted by this generation.
#[derive(Clone, Debug)]
pub struct LocalLogEntryJsonCodecV2 {
    context: EditorContext,
    commit_codec: CommitJsonCodecV2,
}

impl LocalLogEntryJsonCodecV2 {
    /// Creates a V2 entry codec bound to one immutable runtime context.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let commit_codec = CommitJsonCodecV2::new(context.clone());
        Self { context, commit_codec }
    }

    /// Returns the complete context used for binding and nested commit proof.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one Local Log Entry V2 value.
    ///
    /// The complete outer shape and durable binding are admitted before any
    /// identity allocation or nested event reconstruction. Failure never
    /// consumes or mutates the caller's JSON.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogEntryV2CodecError`] for oversized or malformed input,
    /// non-V2 routing, malformed or mismatched schema binding, invalid
    /// identities or sequence, or an invalid nested Commit V2 value.
    pub fn decode(&self, json: &str) -> Result<LocalLogEntry, LocalLogEntryV2CodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(LocalLogEntryV2CodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedLocalLogEntryHeader<'_> = decode_json(json)?;
        if header.format != LOCAL_LOG_ENTRY_FORMAT {
            return Err(LocalLogEntryV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: LOCAL_LOG_ENTRY_FORMAT,
            });
        }
        if header.format_version != LOCAL_LOG_ENTRY_V2_FORMAT_VERSION {
            return Err(LocalLogEntryV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: LOCAL_LOG_ENTRY_V2_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedLocalLogEntryRecordV2<'_> = decode_json(json)?;
        let schema = decode_schema_id(&envelope.schema)?;
        require_schema_id(self.context.schema(), &schema)?;
        let fingerprint = envelope.schema_fingerprint.parse::<SchemaFingerprint>()?;
        require_schema_fingerprint(self.context.schema(), fingerprint)?;
        let binding = DurableSchemaBinding::new(schema, fingerprint);

        let session_id = decode_session_id(envelope.session_id)?;
        let log_id = decode_log_id(envelope.log_id)?;
        let sequence = decode_sequence(envelope.sequence)?;
        let replay_id = decode_replay_id(envelope.replay_id)?;
        let event = self.decode_event(envelope.event)?;

        Ok(LocalLogEntry::new_with_schema_binding(
            binding, session_id, log_id, sequence, replay_id, event,
        ))
    }

    /// Encodes one checked runtime entry into deterministic compact V2 JSON.
    ///
    /// The entry's retained selector and fingerprint must both equal the codec
    /// context. Commit-bearing events are encoded only through Commit V2.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogEntryV2CodecError`] for binding/context mismatch,
    /// invalid event proof, nested Commit V2 failure, serialization failure, or
    /// output exceeding the shared byte budget.
    pub fn encode(&self, entry: &LocalLogEntry) -> Result<String, LocalLogEntryV2CodecError> {
        require_schema_binding(self.context.schema(), entry.schema_binding())?;
        entry.event().validate().map_err(LocalLogEntryV2CodecError::InvalidEventCommit)?;
        let event: LocalLogEventRecordV1<Box<RawValue>> = match entry.event().kind() {
            LocalLogEventKind::Commit => LocalLogEventRecordV1::Commit {
                commit: self.encode_event_commit(entry.event(), LocalLogCommitEventKind::Commit)?,
            },
            LocalLogEventKind::Undo => LocalLogEventRecordV1::Undo {
                commit: self.encode_event_commit(entry.event(), LocalLogCommitEventKind::Undo)?,
            },
            LocalLogEventKind::Redo => LocalLogEventRecordV1::Redo {
                commit: self.encode_event_commit(entry.event(), LocalLogCommitEventKind::Redo)?,
            },
            LocalLogEventKind::CloseHistoryGroup => LocalLogEventRecordV1::CloseHistoryGroup {},
            LocalLogEventKind::ClearHistory => LocalLogEventRecordV1::ClearHistory {},
        };
        let encoding = LocalLogEntryEncodingV2 { entry, event };

        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &encoding);
        if byte_counter.exceeded() {
            return Err(LocalLogEntryV2CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogEntryV2CodecError::Encoding)?;
        serde_json::to_string(&encoding)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogEntryV2CodecError::Encoding)
    }

    fn decode_event(&self, raw: &RawValue) -> Result<LocalLogEvent, LocalLogEntryV2CodecError> {
        let header: BorrowedLocalLogEventHeader = decode_json(raw.get())?;
        match header.kind {
            BorrowedLocalLogEventKind::Commit => {
                let event: BorrowedCommitLocalLogEvent<'_> = decode_json(raw.get())?;
                self.decode_commit(event.commit, LocalLogCommitEventKind::Commit)
                    .map(LocalLogEvent::commit)
            }
            BorrowedLocalLogEventKind::Undo => {
                let event: BorrowedCommitLocalLogEvent<'_> = decode_json(raw.get())?;
                let commit = self.decode_commit(event.commit, LocalLogCommitEventKind::Undo)?;
                LocalLogEvent::try_undo(commit)
                    .map_err(LocalLogEntryV2CodecError::InvalidEventCommit)
            }
            BorrowedLocalLogEventKind::Redo => {
                let event: BorrowedCommitLocalLogEvent<'_> = decode_json(raw.get())?;
                let commit = self.decode_commit(event.commit, LocalLogCommitEventKind::Redo)?;
                LocalLogEvent::try_redo(commit)
                    .map_err(LocalLogEntryV2CodecError::InvalidEventCommit)
            }
            BorrowedLocalLogEventKind::CloseHistoryGroup => {
                let _: BorrowedControlLocalLogEvent = decode_json(raw.get())?;
                Ok(LocalLogEvent::close_history_group())
            }
            BorrowedLocalLogEventKind::ClearHistory => {
                let _: BorrowedControlLocalLogEvent = decode_json(raw.get())?;
                Ok(LocalLogEvent::clear_history())
            }
        }
    }

    fn decode_commit(
        &self,
        raw: &RawValue,
        event_kind: LocalLogCommitEventKind,
    ) -> Result<Commit, LocalLogEntryV2CodecError> {
        validate_nested_commit_header(raw.get(), event_kind)?;
        self.commit_codec.decode(raw.get()).map_err(|source| {
            LocalLogEntryV2CodecError::InvalidCommit { event_kind, source: Box::new(source) }
        })
    }

    fn encode_commit(
        &self,
        commit: &Commit,
        event_kind: LocalLogCommitEventKind,
    ) -> Result<Box<RawValue>, LocalLogEntryV2CodecError> {
        let encoded = self.commit_codec.encode(commit).map_err(|source| match source {
            CommitV2CodecError::ContextConfigurationMismatch => {
                LocalLogEntryV2CodecError::ContextConfigurationMismatch
            }
            CommitV2CodecError::OutputTooLarge { minimum, maximum } => {
                LocalLogEntryV2CodecError::OutputTooLarge { minimum, maximum }
            }
            source => {
                LocalLogEntryV2CodecError::InvalidCommit { event_kind, source: Box::new(source) }
            }
        })?;
        validate_nested_commit_header(&encoded, event_kind)?;
        RawValue::from_string(encoded)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogEntryV2CodecError::Encoding)
    }

    fn encode_event_commit(
        &self,
        event: &LocalLogEvent,
        event_kind: LocalLogCommitEventKind,
    ) -> Result<Box<RawValue>, LocalLogEntryV2CodecError> {
        let commit =
            event.as_commit().ok_or_else(|| LocalLogEntryV2CodecError::RuntimeInvariant {
                diagnostic: BoundedDiagnostic::from(
                    "commit-bearing local-log event has no retained commit",
                ),
            })?;
        self.encode_commit(commit, event_kind)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedLocalLogEntryHeader<'a> {
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
struct BorrowedLocalLogEntryRecordV2<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    schema: BorrowedSchemaIdRecord<'a>,
    #[serde(borrow)]
    schema_fingerprint: Cow<'a, str>,
    #[serde(borrow)]
    session_id: &'a RawValue,
    #[serde(borrow)]
    log_id: &'a RawValue,
    #[serde(borrow)]
    sequence: &'a RawValue,
    #[serde(borrow)]
    replay_id: &'a RawValue,
    #[serde(borrow)]
    event: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedLocalLogEventHeader {
    kind: BorrowedLocalLogEventKind,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum BorrowedLocalLogEventKind {
    Commit,
    Undo,
    Redo,
    CloseHistoryGroup,
    ClearHistory,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedCommitLocalLogEvent<'a> {
    #[serde(rename = "kind")]
    _kind: IgnoredAny,
    #[serde(borrow)]
    commit: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedControlLocalLogEvent {
    #[serde(rename = "kind")]
    _kind: IgnoredAny,
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, LocalLogEntryV2CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(LocalLogEntryV2CodecError::InvalidJson)
}

fn decode_schema_id(
    schema: &BorrowedSchemaIdRecord<'_>,
) -> Result<SchemaId, LocalLogEntryV2CodecError> {
    let name = QualifiedName::try_new(schema.name.as_ref()).map_err(|source| {
        LocalLogEntryV2CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(schema.version).map_err(|source| {
        LocalLogEntryV2CodecError::InvalidSchemaVersion { value: schema.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn decode_session_id(raw: &RawValue) -> Result<LocalSessionId, LocalLogEntryV2CodecError> {
    preflight_bounded_string(
        raw,
        MAX_IDENTITY_STRING_JSON_BYTES,
        LocalLogEntryRecordErrorCode::InvalidSessionId,
        LocalLogEntryRecordLocation::SessionId,
        "encoded session ID exceeds its maximum JSON string representation",
    )?;
    let value: String = decode_json(raw.get())?;
    LocalSessionId::try_new(value).map_err(|error| {
        record_error(
            LocalLogEntryRecordErrorCode::InvalidSessionId,
            LocalLogEntryRecordLocation::SessionId,
            error.to_string(),
        )
    })
}

fn decode_log_id(raw: &RawValue) -> Result<LocalLogId, LocalLogEntryV2CodecError> {
    preflight_bounded_string(
        raw,
        MAX_IDENTITY_STRING_JSON_BYTES,
        LocalLogEntryRecordErrorCode::InvalidLogId,
        LocalLogEntryRecordLocation::LogId,
        "encoded log ID exceeds its maximum JSON string representation",
    )?;
    let value: String = decode_json(raw.get())?;
    LocalLogId::try_new(value).map_err(|error| {
        record_error(
            LocalLogEntryRecordErrorCode::InvalidLogId,
            LocalLogEntryRecordLocation::LogId,
            error.to_string(),
        )
    })
}

fn decode_sequence(raw: &RawValue) -> Result<LocalLogSequence, LocalLogEntryV2CodecError> {
    preflight_bounded_string(
        raw,
        MAX_DECIMAL_U64_STRING_JSON_BYTES,
        LocalLogEntryRecordErrorCode::InvalidSequence,
        LocalLogEntryRecordLocation::Sequence,
        "encoded sequence exceeds the canonical u64 JSON string bound",
    )?;
    let value: String = decode_json(raw.get())?;
    let record = DecimalU64Record::try_from_decimal(&value).map_err(|error| {
        record_error(
            LocalLogEntryRecordErrorCode::InvalidSequence,
            LocalLogEntryRecordLocation::Sequence,
            sequence_record_diagnostic(error),
        )
    })?;
    LocalLogSequence::try_new(record.get()).map_err(|error| {
        record_error(
            LocalLogEntryRecordErrorCode::InvalidSequence,
            LocalLogEntryRecordLocation::Sequence,
            error.to_string(),
        )
    })
}

fn decode_replay_id(raw: &RawValue) -> Result<ReplayId, LocalLogEntryV2CodecError> {
    preflight_bounded_string(
        raw,
        MAX_IDENTITY_STRING_JSON_BYTES,
        LocalLogEntryRecordErrorCode::InvalidReplayId,
        LocalLogEntryRecordLocation::ReplayId,
        "encoded replay ID exceeds its maximum JSON string representation",
    )?;
    let value: String = decode_json(raw.get())?;
    ReplayId::try_new(value).map_err(|error| {
        record_error(
            LocalLogEntryRecordErrorCode::InvalidReplayId,
            LocalLogEntryRecordLocation::ReplayId,
            error.to_string(),
        )
    })
}

fn preflight_bounded_string(
    raw: &RawValue,
    maximum: usize,
    code: LocalLogEntryRecordErrorCode,
    location: LocalLogEntryRecordLocation,
    diagnostic: &'static str,
) -> Result<(), LocalLogEntryV2CodecError> {
    if !raw.get().trim_start().starts_with('"') {
        let _: String = decode_json(raw.get())?;
    }
    if raw.get().len() > maximum {
        return Err(record_error(code, location, diagnostic));
    }
    Ok(())
}

fn record_error(
    code: LocalLogEntryRecordErrorCode,
    location: LocalLogEntryRecordLocation,
    diagnostic: impl Into<BoundedDiagnostic>,
) -> LocalLogEntryV2CodecError {
    LocalLogEntryRecordError::new(code, location, diagnostic).into()
}

fn validate_nested_commit_header(
    json: &str,
    event_kind: LocalLogCommitEventKind,
) -> Result<(), LocalLogEntryV2CodecError> {
    let header: BorrowedNestedCommitHeader<'_> = serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(CommitV2CodecError::InvalidJson)
        .map_err(|source| LocalLogEntryV2CodecError::InvalidCommit {
            event_kind,
            source: Box::new(source),
        })?;
    if header.format != COMMIT_FORMAT {
        return Err(LocalLogEntryV2CodecError::InvalidCommit {
            event_kind,
            source: Box::new(CommitV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: COMMIT_FORMAT,
            }),
        });
    }
    if header.format_version != COMMIT_V2_FORMAT_VERSION {
        return Err(LocalLogEntryV2CodecError::InvalidCommit {
            event_kind,
            source: Box::new(CommitV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: COMMIT_V2_FORMAT_VERSION,
            }),
        });
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedNestedCommitHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

const fn sequence_record_diagnostic(error: DecimalU64RecordError) -> &'static str {
    match error {
        DecimalU64RecordError::InvalidGrammar => "sequence must use unsigned decimal digits",
        DecimalU64RecordError::LeadingZero => "sequence must not contain a leading zero",
        DecimalU64RecordError::Overflow => "sequence exceeds the unsigned 64-bit maximum",
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use crate::{
        codec::LocalLogEntryJsonCodec,
        local_log::{
            LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogSequence, LocalSessionId, ReplayId,
        },
        schema::{CompiledSchema, SchemaBindingError},
        state::EditorContext,
    };

    use super::{LocalLogEntryJsonCodecV2, LocalLogEntryV2CodecError};

    #[test]
    fn control_event_retains_variant_binding_and_base_rejects_it() -> Result<(), Box<dyn Error>> {
        let variant_schema = CompiledSchema::test_semantic_variant_same_id();
        let entry = LocalLogEntry::new_with_schema_binding(
            variant_schema.durable_binding(),
            LocalSessionId::try_new("session:variant")?,
            LocalLogId::try_new("log:variant")?,
            LocalLogSequence::FIRST,
            ReplayId::try_new("replay:variant")?,
            LocalLogEvent::clear_history(),
        );
        let variant = LocalLogEntryJsonCodecV2::new(EditorContext::new(
            variant_schema,
            crate::schema::DocumentLimits::default(),
        ));
        let encoded = variant.encode(&entry)?;
        let decoded = variant.decode(&encoded)?;

        assert_eq!(decoded, entry);
        assert_eq!(decoded.schema_binding(), entry.schema_binding());
        let base = LocalLogEntryJsonCodecV2::new(EditorContext::default());
        assert!(matches!(
            base.decode(&encoded),
            Err(LocalLogEntryV2CodecError::SchemaBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
        ));
        assert!(matches!(
            base.encode(&entry),
            Err(LocalLogEntryV2CodecError::SchemaBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
        ));
        assert!(matches!(
            LocalLogEntryJsonCodec::new(variant.context().clone()).encode(&entry),
            Err(crate::codec::LocalLogEntryCodecError::ContextConfigurationMismatch)
        ));
        Ok(())
    }
}
