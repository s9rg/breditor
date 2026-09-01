use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCheckpointAnchorCheckpointParts,
        LocalLogCheckpointAnchorInvariantError, LocalLogCheckpointBinding, LocalLogId,
        LocalLogSequence, LocalSessionId, MAX_LOCAL_LOG_IDENTITY_BYTES,
    },
    record::{
        DecimalU64Record, DecimalU64RecordError, LOCAL_LOG_CHECKPOINT_FORMAT as RECORD_FORMAT,
        LOCAL_LOG_CHECKPOINT_FORMAT_VERSION as RECORD_FORMAT_VERSION, LocalLogCheckpointRecordV1,
    },
    state::EditorContext,
};

use super::{
    BoundedDiagnostic, JsonFailure, LocalLogCheckpointBindingField, LocalLogCheckpointCodecError,
    LocalLogCheckpointLimits, LocalLogCheckpointRecordError, LocalLogCheckpointRecordErrorCode,
    LocalLogCheckpointRecordLocation, LocalLogCheckpointResourceLimit,
    LocalLogCheckpointTopologyError, SessionCheckpointCodecError, SessionCheckpointJsonCodec,
    json_size::JsonByteCounter,
    local_log_checkpoint_tombstones_v1::{count_replay_tombstones, decode_replay_tombstones},
    session_checkpoint_json::SESSION_CHECKPOINT_FORMAT_VERSION as ACTIVE_SESSION_CHECKPOINT_VERSION,
};

/// Stable identifier for Breditor's complete local-log checkpoint.
pub const LOCAL_LOG_CHECKPOINT_FORMAT: &str = RECORD_FORMAT;

/// Local-log-checkpoint wire version implemented by this codec.
pub const LOCAL_LOG_CHECKPOINT_FORMAT_VERSION: u32 = RECORD_FORMAT_VERSION;

const NESTED_SESSION_CHECKPOINT_FORMAT: &str = "breditor/session-checkpoint";
const NESTED_SESSION_CHECKPOINT_FORMAT_VERSION: u32 = 1;
const MAX_IDENTITY_STRING_JSON_BYTES: usize = 6 * MAX_LOCAL_LOG_IDENTITY_BYTES + 2;
const MAX_DECIMAL_U64_STRING_JSON_BYTES: usize = 6 * 20 + 2;

// Local Log Checkpoint V1 embeds Session Checkpoint V1 by value. If the active
// codec moves, this composition must retain an explicit V1 implementation or
// increment the outer format instead of drifting silently.
const _: () =
    assert!(ACTIVE_SESSION_CHECKPOINT_VERSION == NESTED_SESSION_CHECKPOINT_FORMAT_VERSION);

/// Strict, expected-binding codec for one compacted local-log prefix.
///
/// V1 retains the exact session checkpoint plus one complete, record-declared
/// chronological replay-ID tombstone vector. Array position derives the
/// represented one-based sequence. Decode checks every wire identity against
/// an independently supplied trusted binding before publishing an anchor.
///
/// These checks prove structural consistency only. They do not prove that the
/// session was caused by the tombstones, authenticate bytes, prevent rollback,
/// fence writers, or make two separately decoded anchors one owner.
#[derive(Clone, Debug)]
pub struct LocalLogCheckpointJsonCodec {
    expected: LocalLogCheckpointBinding,
    limits: LocalLogCheckpointLimits,
    session_codec: SessionCheckpointJsonCodec,
}

impl LocalLogCheckpointJsonCodec {
    /// Creates a codec bound to one trusted storage scope and default limits.
    #[must_use]
    pub fn new(context: EditorContext, expected: LocalLogCheckpointBinding) -> Self {
        Self {
            expected,
            limits: LocalLogCheckpointLimits::default(),
            session_codec: SessionCheckpointJsonCodec::new(context),
        }
    }

    /// Replaces the host-authoritative outer and nested checkpoint policy.
    #[must_use]
    pub fn with_limits(mut self, limits: LocalLogCheckpointLimits) -> Self {
        self.session_codec = self.session_codec.with_limits(limits.session_checkpoint());
        self.limits = limits;
        self
    }

    /// Returns the immutable runtime context used for nested session proof.
    #[must_use]
    pub const fn context(&self) -> &EditorContext {
        self.session_codec.context()
    }

    /// Returns the independently supplied identity expectation.
    #[must_use]
    pub const fn expected_binding(&self) -> &LocalLogCheckpointBinding {
        &self.expected
    }

    /// Returns the complete host-authoritative admission policy.
    #[must_use]
    pub const fn limits(&self) -> &LocalLogCheckpointLimits {
        &self.limits
    }

    /// Strictly decodes one complete, trusted-scope Local Log Checkpoint V1.
    ///
    /// The expected binding must originate outside `json`. Equality with it is
    /// not authenticity: callers still need integrity-protected storage,
    /// rollback policy, and single-owner writer fencing for exactly-once use.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCheckpointCodecError`] for oversized or malformed
    /// input, unsupported routing, invalid or mismatched identities,
    /// frontier/tombstone disagreement, resource excess, invalid nested session
    /// proof, or impossible empty-prefix history.
    pub fn decode(
        &self,
        json: &str,
    ) -> Result<LocalLogCheckpointAnchor, LocalLogCheckpointCodecError> {
        let maximum = self.context().limits().max_json_bytes();
        if json.len() > maximum {
            return Err(LocalLogCheckpointCodecError::InputTooLarge {
                actual: json.len(),
                maximum,
            });
        }

        let header: BorrowedLocalLogCheckpointHeader<'_> = decode_json(json)?;
        if header.format != LOCAL_LOG_CHECKPOINT_FORMAT {
            return Err(LocalLogCheckpointCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: LOCAL_LOG_CHECKPOINT_FORMAT,
            });
        }
        if header.format_version != LOCAL_LOG_CHECKPOINT_FORMAT_VERSION {
            return Err(LocalLogCheckpointCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: LOCAL_LOG_CHECKPOINT_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedLocalLogCheckpointRecordV1<'_> = decode_json(json)?;
        let session_id = decode_session_id(envelope.session_id)?;
        let checkpoint_log_id = decode_checkpoint_log_id(envelope.checkpoint_log_id)?;
        let successor_log_id = decode_successor_log_id(envelope.successor_log_id)?;
        let covered_through = decode_covered_through(envelope.covered_through)?;

        if checkpoint_log_id == successor_log_id {
            return Err(LocalLogCheckpointTopologyError::GenerationNotAdvanced.into());
        }
        self.validate_binding(&session_id, &checkpoint_log_id, &successor_log_id)?;

        let covered_count = covered_through.map_or(0, LocalLogSequence::get);
        let tombstone_maximum = self.limits.max_replay_tombstones();
        if covered_count > tombstone_maximum {
            return Err(LocalLogCheckpointResourceLimit::ReplayTombstones {
                actual: covered_count,
                maximum: tombstone_maximum,
            }
            .into());
        }
        let tombstone_count =
            count_replay_tombstones(envelope.replay_tombstones.get(), tombstone_maximum)?;
        if tombstone_count != covered_count {
            return Err(LocalLogCheckpointTopologyError::TombstoneCountMismatch {
                covered: covered_count,
                actual: tombstone_count,
            }
            .into());
        }
        let compacted_replays =
            decode_replay_tombstones(envelope.replay_tombstones.get(), tombstone_count)?;

        validate_nested_session_header(envelope.session_checkpoint)?;
        let session = self
            .session_codec
            .decode(envelope.session_checkpoint.get())
            .map_err(LocalLogCheckpointCodecError::InvalidSessionCheckpoint)?;
        if covered_through.is_none() && !session.has_genesis_empty_history() {
            return Err(LocalLogCheckpointTopologyError::NonGenesisEmptyHistory.into());
        }

        LocalLogCheckpointAnchor::try_from_checkpoint_parts(
            session_id,
            checkpoint_log_id,
            successor_log_id,
            session,
            compacted_replays,
            covered_through,
        )
        .map_err(anchor_invariant_error)
    }

    /// Encodes one checked anchor into deterministic compact V1 JSON.
    ///
    /// Encoding rechecks the trusted binding, private topology, configured
    /// tombstone limit, nested session policy, and complete outer byte budget.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCheckpointCodecError`] for context or binding mismatch,
    /// resource excess, an impossible private invariant, nested session failure,
    /// or serialization/byte-budget failure.
    pub fn encode(
        &self,
        anchor: &LocalLogCheckpointAnchor,
    ) -> Result<String, LocalLogCheckpointCodecError> {
        let parts = anchor.checkpoint_parts();
        if parts.session.state().context() != self.context() {
            return Err(LocalLogCheckpointCodecError::ContextConfigurationMismatch);
        }
        if parts.checkpoint_log_id == parts.successor_log_id {
            return Err(runtime_invariant(
                "runtime checkpoint reused its sealed generation identity",
            ));
        }
        self.validate_binding(parts.session_id, parts.checkpoint_log_id, parts.successor_log_id)?;

        let replay_tombstones = self.encode_replay_tombstones(&parts)?;
        if parts.checkpoint_covered_through.is_none() && !parts.session.has_genesis_empty_history()
        {
            return Err(runtime_invariant(
                "empty runtime checkpoint retained behaviorally nonempty history",
            ));
        }
        let session_json =
            self.session_codec.encode(parts.session).map_err(|source| match source {
                SessionCheckpointCodecError::ContextConfigurationMismatch => {
                    LocalLogCheckpointCodecError::ContextConfigurationMismatch
                }
                SessionCheckpointCodecError::OutputTooLarge { minimum, maximum } => {
                    LocalLogCheckpointCodecError::OutputTooLarge { minimum, maximum }
                }
                source => LocalLogCheckpointCodecError::InvalidSessionCheckpoint(source),
            })?;
        validate_nested_session_header_json(&session_json)?;
        let session_checkpoint = RawValue::from_string(session_json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogCheckpointCodecError::Encoding)?;

        let record = LocalLogCheckpointRecordV1 {
            format: LOCAL_LOG_CHECKPOINT_FORMAT.to_owned(),
            format_version: LOCAL_LOG_CHECKPOINT_FORMAT_VERSION,
            session_id: parts.session_id.as_str().to_owned(),
            checkpoint_log_id: parts.checkpoint_log_id.as_str().to_owned(),
            successor_log_id: parts.successor_log_id.as_str().to_owned(),
            covered_through: parts
                .checkpoint_covered_through
                .map(|sequence| DecimalU64Record::new(sequence.get())),
            replay_tombstones,
            session_checkpoint,
        };

        let maximum = self.context().limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &record);
        if byte_counter.exceeded() {
            return Err(LocalLogCheckpointCodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogCheckpointCodecError::Encoding)?;
        serde_json::to_string(&record)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogCheckpointCodecError::Encoding)
    }

    fn validate_binding(
        &self,
        session_id: &LocalSessionId,
        checkpoint_log_id: &LocalLogId,
        successor_log_id: &LocalLogId,
    ) -> Result<(), LocalLogCheckpointCodecError> {
        validate_binding_field(
            LocalLogCheckpointBindingField::SessionId,
            self.expected.session_id().as_str(),
            session_id.as_str(),
        )?;
        validate_binding_field(
            LocalLogCheckpointBindingField::CheckpointLogId,
            self.expected.checkpoint_log_id().as_str(),
            checkpoint_log_id.as_str(),
        )?;
        validate_binding_field(
            LocalLogCheckpointBindingField::SuccessorLogId,
            self.expected.successor_log_id().as_str(),
            successor_log_id.as_str(),
        )
    }

    fn encode_replay_tombstones<'a>(
        &self,
        parts: &LocalLogCheckpointAnchorCheckpointParts<'a>,
    ) -> Result<Vec<&'a str>, LocalLogCheckpointCodecError> {
        let covered_count = parts.checkpoint_covered_through.map_or(0, LocalLogSequence::get);
        let actual_count = u64::try_from(parts.compacted_replays.len())
            .map_err(|_| runtime_invariant("runtime tombstone count does not fit u64"))?;
        if actual_count != covered_count {
            return Err(runtime_invariant(
                "runtime tombstone count disagrees with its covered frontier",
            ));
        }
        let maximum = self.limits.max_replay_tombstones();
        if actual_count > maximum {
            return Err(LocalLogCheckpointResourceLimit::ReplayTombstones {
                actual: actual_count,
                maximum,
            }
            .into());
        }

        let mut encoded = vec![""; parts.compacted_replays.len()];
        for (replay_id, sequence) in parts.compacted_replays {
            let index = usize::try_from(sequence.get() - 1)
                .map_err(|_| runtime_invariant("runtime tombstone index does not fit usize"))?;
            let Some(slot) = encoded.get_mut(index) else {
                return Err(runtime_invariant(
                    "runtime replay tombstone sequence exceeds the covered frontier",
                ));
            };
            if !slot.is_empty() {
                return Err(runtime_invariant("runtime replay tombstone sequence is duplicated"));
            }
            *slot = replay_id.as_str();
        }
        if encoded.iter().any(|replay_id| replay_id.is_empty()) {
            return Err(runtime_invariant(
                "runtime replay tombstones are not a complete contiguous sequence",
            ));
        }
        Ok(encoded)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedLocalLogCheckpointHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedLocalLogCheckpointRecordV1<'a> {
    #[serde(rename = "format")]
    _format: IgnoredAny,
    #[serde(rename = "formatVersion")]
    _format_version: IgnoredAny,
    #[serde(borrow)]
    session_id: &'a RawValue,
    #[serde(borrow)]
    checkpoint_log_id: &'a RawValue,
    #[serde(borrow)]
    successor_log_id: &'a RawValue,
    #[serde(borrow)]
    covered_through: &'a RawValue,
    #[serde(borrow)]
    replay_tombstones: &'a RawValue,
    #[serde(borrow)]
    session_checkpoint: &'a RawValue,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BorrowedNestedSessionCheckpointHeader<'a> {
    #[serde(borrow)]
    format: Cow<'a, str>,
    format_version: u32,
}

fn decode_json<'de, T>(json: &'de str) -> Result<T, LocalLogCheckpointCodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(LocalLogCheckpointCodecError::InvalidJson)
}

fn decode_session_id(raw: &RawValue) -> Result<LocalSessionId, LocalLogCheckpointCodecError> {
    preflight_bounded_string(
        raw,
        LocalLogCheckpointRecordErrorCode::InvalidSessionId,
        LocalLogCheckpointRecordLocation::SessionId,
        "encoded session ID exceeds its maximum JSON string representation",
    )?;
    let value: String = decode_json(raw.get())?;
    LocalSessionId::try_new(value).map_err(|error| {
        record_error(
            LocalLogCheckpointRecordErrorCode::InvalidSessionId,
            LocalLogCheckpointRecordLocation::SessionId,
            error.to_string(),
        )
    })
}

fn decode_checkpoint_log_id(raw: &RawValue) -> Result<LocalLogId, LocalLogCheckpointCodecError> {
    preflight_bounded_string(
        raw,
        LocalLogCheckpointRecordErrorCode::InvalidCheckpointLogId,
        LocalLogCheckpointRecordLocation::CheckpointLogId,
        "encoded checkpoint log ID exceeds its maximum JSON string representation",
    )?;
    let value: String = decode_json(raw.get())?;
    LocalLogId::try_new(value).map_err(|error| {
        record_error(
            LocalLogCheckpointRecordErrorCode::InvalidCheckpointLogId,
            LocalLogCheckpointRecordLocation::CheckpointLogId,
            error.to_string(),
        )
    })
}

fn decode_successor_log_id(raw: &RawValue) -> Result<LocalLogId, LocalLogCheckpointCodecError> {
    preflight_bounded_string(
        raw,
        LocalLogCheckpointRecordErrorCode::InvalidSuccessorLogId,
        LocalLogCheckpointRecordLocation::SuccessorLogId,
        "encoded successor log ID exceeds its maximum JSON string representation",
    )?;
    let value: String = decode_json(raw.get())?;
    LocalLogId::try_new(value).map_err(|error| {
        record_error(
            LocalLogCheckpointRecordErrorCode::InvalidSuccessorLogId,
            LocalLogCheckpointRecordLocation::SuccessorLogId,
            error.to_string(),
        )
    })
}

fn preflight_bounded_string(
    raw: &RawValue,
    code: LocalLogCheckpointRecordErrorCode,
    location: LocalLogCheckpointRecordLocation,
    diagnostic: &'static str,
) -> Result<(), LocalLogCheckpointCodecError> {
    if !raw.get().trim_start().starts_with('"') {
        let _: String = decode_json(raw.get())?;
    }
    if raw.get().len() > MAX_IDENTITY_STRING_JSON_BYTES {
        return Err(record_error(code, location, diagnostic));
    }
    Ok(())
}

fn decode_covered_through(
    raw: &RawValue,
) -> Result<Option<LocalLogSequence>, LocalLogCheckpointCodecError> {
    if raw.get().trim() != "null" && raw.get().len() > MAX_DECIMAL_U64_STRING_JSON_BYTES {
        return Err(record_error(
            LocalLogCheckpointRecordErrorCode::InvalidCoveredThrough,
            LocalLogCheckpointRecordLocation::CoveredThrough,
            "encoded covered frontier exceeds the canonical u64 JSON string bound",
        ));
    }
    let value: Option<String> = decode_json(raw.get())?;
    value
        .map(|value| {
            let record = DecimalU64Record::try_from_decimal(&value).map_err(|error| {
                record_error(
                    LocalLogCheckpointRecordErrorCode::InvalidCoveredThrough,
                    LocalLogCheckpointRecordLocation::CoveredThrough,
                    covered_record_diagnostic(error),
                )
            })?;
            LocalLogSequence::try_new(record.get()).map_err(|error| {
                record_error(
                    LocalLogCheckpointRecordErrorCode::InvalidCoveredThrough,
                    LocalLogCheckpointRecordLocation::CoveredThrough,
                    error.to_string(),
                )
            })
        })
        .transpose()
}

fn validate_binding_field(
    field: LocalLogCheckpointBindingField,
    expected: &str,
    actual: &str,
) -> Result<(), LocalLogCheckpointCodecError> {
    if expected == actual {
        return Ok(());
    }
    Err(LocalLogCheckpointCodecError::BindingMismatch { field })
}

fn validate_nested_session_header(raw: &RawValue) -> Result<(), LocalLogCheckpointCodecError> {
    validate_nested_session_header_json(raw.get())
}

fn validate_nested_session_header_json(json: &str) -> Result<(), LocalLogCheckpointCodecError> {
    let header: BorrowedNestedSessionCheckpointHeader<'_> = serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(SessionCheckpointCodecError::InvalidJson)
        .map_err(LocalLogCheckpointCodecError::InvalidSessionCheckpoint)?;
    if header.format != NESTED_SESSION_CHECKPOINT_FORMAT {
        return Err(LocalLogCheckpointCodecError::InvalidSessionCheckpoint(
            SessionCheckpointCodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: NESTED_SESSION_CHECKPOINT_FORMAT,
            },
        ));
    }
    if header.format_version != NESTED_SESSION_CHECKPOINT_FORMAT_VERSION {
        return Err(LocalLogCheckpointCodecError::InvalidSessionCheckpoint(
            SessionCheckpointCodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: NESTED_SESSION_CHECKPOINT_FORMAT_VERSION,
            },
        ));
    }
    Ok(())
}

fn record_error(
    code: LocalLogCheckpointRecordErrorCode,
    location: LocalLogCheckpointRecordLocation,
    diagnostic: impl Into<BoundedDiagnostic>,
) -> LocalLogCheckpointCodecError {
    LocalLogCheckpointRecordError::new(code, location, diagnostic).into()
}

fn runtime_invariant(diagnostic: &'static str) -> LocalLogCheckpointCodecError {
    LocalLogCheckpointCodecError::RuntimeInvariant {
        diagnostic: BoundedDiagnostic::from(diagnostic),
    }
}

fn anchor_invariant_error(
    error: LocalLogCheckpointAnchorInvariantError,
) -> LocalLogCheckpointCodecError {
    let diagnostic = match error {
        LocalLogCheckpointAnchorInvariantError::GenerationNotAdvanced => {
            "checked anchor factory rejected equal generations"
        }
        LocalLogCheckpointAnchorInvariantError::TombstoneCountMismatch => {
            "checked anchor factory rejected tombstone cardinality"
        }
        LocalLogCheckpointAnchorInvariantError::DuplicateSequence => {
            "checked anchor factory rejected duplicate tombstone sequence"
        }
        LocalLogCheckpointAnchorInvariantError::SequenceOutOfRange => {
            "checked anchor factory rejected out-of-range tombstone sequence"
        }
        LocalLogCheckpointAnchorInvariantError::NonGenesisEmptyHistory => {
            "checked anchor factory rejected non-genesis empty-prefix history"
        }
    };
    runtime_invariant(diagnostic)
}

const fn covered_record_diagnostic(error: DecimalU64RecordError) -> &'static str {
    match error {
        DecimalU64RecordError::InvalidGrammar => {
            "covered frontier must use unsigned decimal digits"
        }
        DecimalU64RecordError::LeadingZero => "covered frontier must not contain a leading zero",
        DecimalU64RecordError::Overflow => "covered frontier exceeds the unsigned 64-bit maximum",
    }
}
