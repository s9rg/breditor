use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogEventKind, LocalLogId, LocalLogSequence,
        LocalSessionId, MAX_LOCAL_LOG_IDENTITY_BYTES, ReplayId,
    },
    record::{
        DecimalU64Record, DecimalU64RecordError, LOCAL_LOG_ENTRY_FORMAT as RECORD_FORMAT,
        LOCAL_LOG_ENTRY_FORMAT_VERSION as RECORD_FORMAT_VERSION, LocalLogEntryRecordV1,
        LocalLogEventRecordV1,
    },
    state::EditorContext,
    transaction::Commit,
};

use super::{
    BoundedDiagnostic, CommitCodecError, CommitJsonCodec, JsonFailure, LocalLogCommitEventKind,
    LocalLogEntryCodecError, LocalLogEntryRecordError, LocalLogEntryRecordErrorCode,
    LocalLogEntryRecordLocation,
    commit_json::COMMIT_FORMAT_VERSION as ACTIVE_COMMIT_FORMAT_VERSION, json_size::JsonByteCounter,
};

/// Stable identifier for Breditor's one-entry durable local-log envelope.
pub const LOCAL_LOG_ENTRY_FORMAT: &str = RECORD_FORMAT;

/// Durable local-log-entry wire version implemented by this codec.
pub const LOCAL_LOG_ENTRY_FORMAT_VERSION: u32 = RECORD_FORMAT_VERSION;

const LOCAL_LOG_NESTED_COMMIT_FORMAT: &str = "breditor/commit";
const LOCAL_LOG_NESTED_COMMIT_FORMAT_VERSION: u32 = 1;
const MAX_IDENTITY_STRING_JSON_BYTES: usize = 6 * MAX_LOCAL_LOG_IDENTITY_BYTES + 2;
const MAX_DECIMAL_U64_STRING_JSON_BYTES: usize = 6 * 20 + 2;

// Local Log Entry V1 embeds Commit V1 by value. If the active commit codec
// moves to another version, this boundary must retain an explicit Commit V1
// codec or increment the local-log-entry version instead of drifting silently.
const _: () = assert!(ACTIVE_COMMIT_FORMAT_VERSION == LOCAL_LOG_NESTED_COMMIT_FORMAT_VERSION);

/// Strict codec for one ordered local-session event.
///
/// Each record carries a stable session identity, one append-generation log
/// identity, a session-global one-based sequence, and an opaque replay ID. The
/// codec validates those fields and replay-proves commit-bearing event payloads
/// through [`CommitJsonCodec`]. It does not by itself enforce adjacency,
/// replay-ID uniqueness, idempotence, checkpoint linkage, or authorization.
#[derive(Clone, Debug)]
pub struct LocalLogEntryJsonCodec {
    context: EditorContext,
    commit_codec: CommitJsonCodec,
}

impl LocalLogEntryJsonCodec {
    /// Creates a local-log-entry codec bound to one immutable runtime context.
    #[must_use]
    pub fn new(context: EditorContext) -> Self {
        let commit_codec = CommitJsonCodec::new(context.clone());
        Self { context, commit_codec }
    }

    /// Returns the schema, document limits, and operation ceiling used by this codec.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        &self.context
    }

    /// Strictly decodes one Local Log Entry V1 value.
    ///
    /// Commit, undo, and redo events delegate their nested value to the exact
    /// Commit V1 codec and retain its typed failure as a source. Successful
    /// decoding proves only this entry's internal shape and commit payload; a
    /// log owner must still enforce ordering and replay-ID policy.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogEntryCodecError`] for oversized or malformed input,
    /// unsupported routing fields, invalid identities or sequence, or an
    /// invalid nested commit.
    pub fn decode(&self, json: &str) -> Result<LocalLogEntry, LocalLogEntryCodecError> {
        let maximum = self.context.limits().max_json_bytes();
        if json.len() > maximum {
            return Err(LocalLogEntryCodecError::InputTooLarge { actual: json.len(), maximum });
        }

        let header: BorrowedLocalLogEntryHeader<'_> = decode_json(json)?;
        if header.format != LOCAL_LOG_ENTRY_FORMAT {
            return Err(LocalLogEntryCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: LOCAL_LOG_ENTRY_FORMAT,
            });
        }
        if header.format_version != LOCAL_LOG_ENTRY_FORMAT_VERSION {
            return Err(LocalLogEntryCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: LOCAL_LOG_ENTRY_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedLocalLogEntryRecordV1<'_> = decode_json(json)?;
        preflight_bounded_string(
            envelope.session_id,
            MAX_IDENTITY_STRING_JSON_BYTES,
            LocalLogEntryRecordErrorCode::InvalidSessionId,
            LocalLogEntryRecordLocation::SessionId,
            "encoded session ID exceeds its maximum JSON string representation",
        )?;
        let session_id_value = decode_string(envelope.session_id)?;
        let session_id = LocalSessionId::try_new(&session_id_value).map_err(|error| {
            record_error(
                LocalLogEntryRecordErrorCode::InvalidSessionId,
                LocalLogEntryRecordLocation::SessionId,
                error.to_string(),
            )
        })?;
        preflight_bounded_string(
            envelope.log_id,
            MAX_IDENTITY_STRING_JSON_BYTES,
            LocalLogEntryRecordErrorCode::InvalidLogId,
            LocalLogEntryRecordLocation::LogId,
            "encoded log ID exceeds its maximum JSON string representation",
        )?;
        let log_id_value = decode_string(envelope.log_id)?;
        let log_id = LocalLogId::try_new(&log_id_value).map_err(|error| {
            record_error(
                LocalLogEntryRecordErrorCode::InvalidLogId,
                LocalLogEntryRecordLocation::LogId,
                error.to_string(),
            )
        })?;
        preflight_bounded_string(
            envelope.sequence,
            MAX_DECIMAL_U64_STRING_JSON_BYTES,
            LocalLogEntryRecordErrorCode::InvalidSequence,
            LocalLogEntryRecordLocation::Sequence,
            "encoded sequence exceeds the canonical u64 JSON string bound",
        )?;
        let sequence_value = decode_string(envelope.sequence)?;
        let sequence_record =
            DecimalU64Record::try_from_decimal(&sequence_value).map_err(|error| {
                record_error(
                    LocalLogEntryRecordErrorCode::InvalidSequence,
                    LocalLogEntryRecordLocation::Sequence,
                    sequence_record_diagnostic(error),
                )
            })?;
        let sequence = LocalLogSequence::try_new(sequence_record.get()).map_err(|error| {
            record_error(
                LocalLogEntryRecordErrorCode::InvalidSequence,
                LocalLogEntryRecordLocation::Sequence,
                error.to_string(),
            )
        })?;
        preflight_bounded_string(
            envelope.replay_id,
            MAX_IDENTITY_STRING_JSON_BYTES,
            LocalLogEntryRecordErrorCode::InvalidReplayId,
            LocalLogEntryRecordLocation::ReplayId,
            "encoded replay ID exceeds its maximum JSON string representation",
        )?;
        let replay_id_value = decode_string(envelope.replay_id)?;
        let replay_id = ReplayId::try_new(&replay_id_value).map_err(|error| {
            record_error(
                LocalLogEntryRecordErrorCode::InvalidReplayId,
                LocalLogEntryRecordLocation::ReplayId,
                error.to_string(),
            )
        })?;
        let event = self.decode_event(envelope.event)?;

        Ok(LocalLogEntry::new(session_id, log_id, sequence, replay_id, event))
    }

    /// Encodes one checked local-log entry into deterministic compact V1 JSON.
    ///
    /// The complete outer record must fit the context's JSON byte budget even
    /// when its nested commit is independently encodable under that same cap.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogEntryCodecError`] when a nested commit cannot encode,
    /// serialization fails, or the complete output exceeds the shared byte cap.
    pub fn encode(&self, entry: &LocalLogEntry) -> Result<String, LocalLogEntryCodecError> {
        entry.event().validate().map_err(LocalLogEntryCodecError::InvalidEventCommit)?;
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
        let record = LocalLogEntryRecordV1 {
            format: LOCAL_LOG_ENTRY_FORMAT.to_owned(),
            format_version: LOCAL_LOG_ENTRY_FORMAT_VERSION,
            session_id: entry.session_id().as_str().to_owned(),
            log_id: entry.log_id().as_str().to_owned(),
            sequence: DecimalU64Record::new(entry.sequence().get()),
            replay_id: entry.replay_id().as_str().to_owned(),
            event,
        };

        let maximum = self.context.limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(LocalLogEntryCodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogEntryCodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogEntryCodecError::Encoding)
    }

    fn decode_event(&self, raw: &RawValue) -> Result<LocalLogEvent, LocalLogEntryCodecError> {
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
                LocalLogEvent::try_undo(commit).map_err(LocalLogEntryCodecError::InvalidEventCommit)
            }
            BorrowedLocalLogEventKind::Redo => {
                let event: BorrowedCommitLocalLogEvent<'_> = decode_json(raw.get())?;
                let commit = self.decode_commit(event.commit, LocalLogCommitEventKind::Redo)?;
                LocalLogEvent::try_redo(commit).map_err(LocalLogEntryCodecError::InvalidEventCommit)
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
    ) -> Result<Commit, LocalLogEntryCodecError> {
        validate_nested_commit_header(raw.get(), event_kind)?;
        self.commit_codec
            .decode(raw.get())
            .map_err(|source| LocalLogEntryCodecError::InvalidCommit { event_kind, source })
    }

    fn encode_commit(
        &self,
        commit: &Commit,
        event_kind: LocalLogCommitEventKind,
    ) -> Result<Box<RawValue>, LocalLogEntryCodecError> {
        let encoded = self.commit_codec.encode(commit).map_err(|source| match source {
            CommitCodecError::ContextConfigurationMismatch => {
                LocalLogEntryCodecError::ContextConfigurationMismatch
            }
            CommitCodecError::OutputTooLarge { minimum, maximum } => {
                LocalLogEntryCodecError::OutputTooLarge { minimum, maximum }
            }
            source => LocalLogEntryCodecError::InvalidCommit { event_kind, source },
        })?;
        validate_nested_commit_header(&encoded, event_kind)?;
        RawValue::from_string(encoded)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogEntryCodecError::Encoding)
    }

    fn encode_event_commit(
        &self,
        event: &LocalLogEvent,
        event_kind: LocalLogCommitEventKind,
    ) -> Result<Box<RawValue>, LocalLogEntryCodecError> {
        let commit =
            event.as_commit().ok_or_else(|| LocalLogEntryCodecError::RuntimeInvariant {
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
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedLocalLogEntryRecordV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
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

fn decode_json<'de, T>(json: &'de str) -> Result<T, LocalLogEntryCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(LocalLogEntryCodecError::InvalidJson)
}

fn record_error(
    code: LocalLogEntryRecordErrorCode,
    location: LocalLogEntryRecordLocation,
    diagnostic: impl Into<BoundedDiagnostic>,
) -> LocalLogEntryCodecError {
    LocalLogEntryRecordError::new(code, location, diagnostic).into()
}

fn decode_string(raw: &RawValue) -> Result<String, LocalLogEntryCodecError> {
    decode_json(raw.get())
}

fn preflight_bounded_string(
    raw: &RawValue,
    maximum: usize,
    code: LocalLogEntryRecordErrorCode,
    location: LocalLogEntryRecordLocation,
    diagnostic: &'static str,
) -> Result<(), LocalLogEntryCodecError> {
    if !raw.get().trim_start().starts_with('"') {
        let _: String = decode_string(raw)?;
    }
    if raw.get().len() > maximum {
        return Err(record_error(code, location, diagnostic));
    }
    Ok(())
}

fn validate_nested_commit_header(
    json: &str,
    event_kind: LocalLogCommitEventKind,
) -> Result<(), LocalLogEntryCodecError> {
    let header: BorrowedNestedCommitHeader<'_> = serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(CommitCodecError::InvalidJson)
        .map_err(|source| LocalLogEntryCodecError::InvalidCommit { event_kind, source })?;
    if header.format != LOCAL_LOG_NESTED_COMMIT_FORMAT {
        return Err(LocalLogEntryCodecError::InvalidCommit {
            event_kind,
            source: CommitCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: LOCAL_LOG_NESTED_COMMIT_FORMAT,
            },
        });
    }
    if header.format_version != LOCAL_LOG_NESTED_COMMIT_FORMAT_VERSION {
        return Err(LocalLogEntryCodecError::InvalidCommit {
            event_kind,
            source: CommitCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: LOCAL_LOG_NESTED_COMMIT_FORMAT_VERSION,
            },
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
