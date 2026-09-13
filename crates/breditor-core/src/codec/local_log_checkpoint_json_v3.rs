use std::borrow::Cow;

use serde::{Deserialize, de::IgnoredAny};
use serde_json::value::RawValue;

use crate::{
    identity::QualifiedName,
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCheckpointAnchorCheckpointParts,
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogSequence,
    },
    record::DecimalU64Record,
    schema::{
        SchemaFingerprint, SchemaId, SchemaVersion, require_schema_fingerprint, require_schema_id,
    },
    state::EditorContext,
};

use super::{
    BoundedDiagnostic, JsonFailure, LocalLogCheckpointBindingField, LocalLogCheckpointCodecError,
    LocalLogCheckpointLimits, LocalLogCheckpointResourceLimit, LocalLogCheckpointTopologyError,
    LocalLogCheckpointV3CodecError, SESSION_CHECKPOINT_FORMAT,
    SESSION_CHECKPOINT_V3_FORMAT_VERSION, SessionCheckpointJsonCodecV3,
    SessionCheckpointV3CodecError,
    json_size::JsonByteCounter,
    local_log_checkpoint_encoding_v3::LocalLogCheckpointEncodingV3,
    local_log_checkpoint_json::{
        LOCAL_LOG_CHECKPOINT_FORMAT, anchor_invariant_error, decode_checkpoint_log_id,
        decode_covered_through, decode_session_id, decode_successor_log_id, runtime_invariant,
        validate_binding_field,
    },
    local_log_checkpoint_tombstones_v1::{count_replay_tombstones, decode_replay_tombstones},
};

/// Wire version accepted and emitted by [`LocalLogCheckpointJsonCodecV3`].
pub const LOCAL_LOG_CHECKPOINT_V3_FORMAT_VERSION: u32 = 3;

const _: () = assert!(SESSION_CHECKPOINT_V3_FORMAT_VERSION == 3);

/// Strict property-preserving codec for one compacted local-log prefix.
///
/// V3 preserves the V2 outer envelope and repeats the complete schema binding
/// at that boundary, but embeds a Session Checkpoint V3 by value. The
/// independently supplied session and log identity binding remains mandatory;
/// neither wire assertion is authority.
#[derive(Clone, Debug)]
pub struct LocalLogCheckpointJsonCodecV3 {
    expected: LocalLogCheckpointBinding,
    limits: LocalLogCheckpointLimits,
    session_codec: SessionCheckpointJsonCodecV3,
}

impl LocalLogCheckpointJsonCodecV3 {
    /// Creates a V3 codec bound to one runtime context and trusted log scope.
    #[must_use]
    pub fn new(context: EditorContext, expected: LocalLogCheckpointBinding) -> Self {
        Self {
            expected,
            limits: LocalLogCheckpointLimits::default(),
            session_codec: SessionCheckpointJsonCodecV3::new(context),
        }
    }

    /// Replaces the host-authoritative outer and nested checkpoint policy.
    #[must_use]
    pub fn with_limits(mut self, limits: LocalLogCheckpointLimits) -> Self {
        self.session_codec = self.session_codec.with_limits(limits.session_checkpoint());
        self.limits = limits;
        self
    }

    /// Returns the immutable runtime context used for binding and session proof.
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

    /// Strictly decodes one complete Local Log Checkpoint V3 value.
    ///
    /// Routing and the exact borrowed outer shape are checked before the schema
    /// selector and fingerprint. The durable binding is admitted before any log
    /// identity allocation, tombstone allocation, or nested session replay.
    /// The caller's JSON is only borrowed and is never consumed or rewritten.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCheckpointV3CodecError`] for malformed or mismatched
    /// bindings, untrusted identity disagreement, invalid topology or values,
    /// resource-limit excess, or an invalid nested Session Checkpoint V3.
    pub fn decode(
        &self,
        json: &str,
    ) -> Result<LocalLogCheckpointAnchor, LocalLogCheckpointV3CodecError> {
        let maximum = self.context().limits().max_json_bytes();
        if json.len() > maximum {
            return Err(LocalLogCheckpointV3CodecError::InputTooLarge {
                actual: json.len(),
                maximum,
            });
        }

        let header: BorrowedLocalLogCheckpointHeader<'_> = decode_json(json)?;
        if header.format != LOCAL_LOG_CHECKPOINT_FORMAT {
            return Err(LocalLogCheckpointV3CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: LOCAL_LOG_CHECKPOINT_FORMAT,
            });
        }
        if header.format_version != LOCAL_LOG_CHECKPOINT_V3_FORMAT_VERSION {
            return Err(LocalLogCheckpointV3CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: LOCAL_LOG_CHECKPOINT_V3_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedLocalLogCheckpointRecordV3<'_> = decode_json(json)?;
        let schema = decode_schema_id(&envelope.schema)?;
        require_schema_id(self.context().schema(), &schema)?;
        let fingerprint = envelope.schema_fingerprint.parse::<SchemaFingerprint>()?;
        require_schema_fingerprint(self.context().schema(), fingerprint)?;

        let session_id = checkpoint_result(decode_session_id(envelope.session_id))?;
        let checkpoint_log_id =
            checkpoint_result(decode_checkpoint_log_id(envelope.checkpoint_log_id))?;
        let successor_log_id =
            checkpoint_result(decode_successor_log_id(envelope.successor_log_id))?;
        let covered_through = checkpoint_result(decode_covered_through(envelope.covered_through))?;

        if checkpoint_log_id == successor_log_id {
            return Err(checkpoint_error(
                LocalLogCheckpointTopologyError::GenerationNotAdvanced.into(),
            ));
        }
        self.validate_binding(&session_id, &checkpoint_log_id, &successor_log_id)?;

        let covered_count = covered_through.map_or(0, LocalLogSequence::get);
        let tombstone_maximum = self.limits.max_replay_tombstones();
        if covered_count > tombstone_maximum {
            return Err(checkpoint_error(
                LocalLogCheckpointResourceLimit::ReplayTombstones {
                    actual: covered_count,
                    maximum: tombstone_maximum,
                }
                .into(),
            ));
        }
        let tombstone_count = checkpoint_result(count_replay_tombstones(
            envelope.replay_tombstones.get(),
            tombstone_maximum,
        ))?;
        if tombstone_count != covered_count {
            return Err(checkpoint_error(
                LocalLogCheckpointTopologyError::TombstoneCountMismatch {
                    covered: covered_count,
                    actual: tombstone_count,
                }
                .into(),
            ));
        }
        let compacted_replays = checkpoint_result(decode_replay_tombstones(
            envelope.replay_tombstones.get(),
            tombstone_count,
        ))?;

        validate_nested_session_header(envelope.session_checkpoint)?;
        let session = self
            .session_codec
            .decode(envelope.session_checkpoint.get())
            .map_err(nested_session_error)?;
        if covered_through.is_none() && !session.has_genesis_empty_history() {
            return Err(checkpoint_error(
                LocalLogCheckpointTopologyError::NonGenesisEmptyHistory.into(),
            ));
        }

        LocalLogCheckpointAnchor::try_from_checkpoint_parts(
            session_id,
            checkpoint_log_id,
            successor_log_id,
            LocalLogCompactionLimits::new(tombstone_maximum),
            session,
            compacted_replays,
            covered_through,
        )
        .map_err(anchor_invariant_error)
        .map_err(checkpoint_error)
    }

    /// Encodes one checked anchor into deterministic compact V3 JSON.
    ///
    /// Encoding rechecks the runtime context, retained log identities,
    /// topology, limits, and nested Session Checkpoint V3 proof. It never emits
    /// a V1 or V2 nested session.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCheckpointV3CodecError`] for context or log-binding
    /// mismatch, invalid private topology, nested-session failure, serialization
    /// failure, or output exceeding the shared byte budget.
    pub fn encode(
        &self,
        anchor: &LocalLogCheckpointAnchor,
    ) -> Result<String, LocalLogCheckpointV3CodecError> {
        let parts = anchor.checkpoint_parts();
        if parts.session.state().context() != self.context() {
            return Err(LocalLogCheckpointV3CodecError::ContextConfigurationMismatch);
        }
        if parts.checkpoint_log_id == parts.successor_log_id {
            return Err(checkpoint_error(runtime_invariant(
                "runtime checkpoint reused its sealed generation identity",
            )));
        }
        self.validate_binding(parts.session_id, parts.checkpoint_log_id, parts.successor_log_id)?;

        let replay_tombstones = self.encode_replay_tombstones(&parts)?;
        if parts.checkpoint_covered_through.is_none() && !parts.session.has_genesis_empty_history()
        {
            return Err(checkpoint_error(runtime_invariant(
                "empty runtime checkpoint retained behaviorally nonempty history",
            )));
        }
        let session_json =
            self.session_codec.encode(parts.session).map_err(|source| match source {
                SessionCheckpointV3CodecError::ContextConfigurationMismatch => {
                    LocalLogCheckpointV3CodecError::ContextConfigurationMismatch
                }
                SessionCheckpointV3CodecError::OutputTooLarge { minimum, maximum } => {
                    LocalLogCheckpointV3CodecError::OutputTooLarge { minimum, maximum }
                }
                source => nested_session_error(source),
            })?;
        validate_nested_session_header_json(&session_json)?;
        let session_checkpoint = RawValue::from_string(session_json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogCheckpointV3CodecError::Encoding)?;

        let encoding = LocalLogCheckpointEncodingV3 {
            context: self.context(),
            session_id: parts.session_id.as_str(),
            checkpoint_log_id: parts.checkpoint_log_id.as_str(),
            successor_log_id: parts.successor_log_id.as_str(),
            covered_through: parts
                .checkpoint_covered_through
                .map(|sequence| DecimalU64Record::new(sequence.get())),
            replay_tombstones,
            session_checkpoint,
        };

        let maximum = self.context().limits().max_json_bytes();
        let mut byte_counter = JsonByteCounter::new(maximum);
        let count_result = serde_json::to_writer(&mut byte_counter, &encoding);
        if byte_counter.exceeded() {
            return Err(LocalLogCheckpointV3CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogCheckpointV3CodecError::Encoding)?;
        serde_json::to_string(&encoding)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogCheckpointV3CodecError::Encoding)
    }

    fn validate_binding(
        &self,
        session_id: &crate::local_log::LocalSessionId,
        checkpoint_log_id: &crate::local_log::LocalLogId,
        successor_log_id: &crate::local_log::LocalLogId,
    ) -> Result<(), LocalLogCheckpointV3CodecError> {
        checkpoint_result(validate_binding_field(
            LocalLogCheckpointBindingField::SessionId,
            self.expected.session_id().as_str(),
            session_id.as_str(),
        ))?;
        checkpoint_result(validate_binding_field(
            LocalLogCheckpointBindingField::CheckpointLogId,
            self.expected.checkpoint_log_id().as_str(),
            checkpoint_log_id.as_str(),
        ))?;
        checkpoint_result(validate_binding_field(
            LocalLogCheckpointBindingField::SuccessorLogId,
            self.expected.successor_log_id().as_str(),
            successor_log_id.as_str(),
        ))
    }

    fn encode_replay_tombstones<'a>(
        &self,
        parts: &LocalLogCheckpointAnchorCheckpointParts<'a>,
    ) -> Result<Vec<&'a str>, LocalLogCheckpointV3CodecError> {
        let covered_count = parts.checkpoint_covered_through.map_or(0, LocalLogSequence::get);
        let actual_count = u64::try_from(parts.compacted_replays.len()).map_err(|_| {
            checkpoint_error(runtime_invariant("runtime tombstone count does not fit u64"))
        })?;
        if actual_count != covered_count {
            return Err(checkpoint_error(runtime_invariant(
                "runtime tombstone count disagrees with its covered frontier",
            )));
        }
        let maximum = self.limits.max_replay_tombstones();
        if actual_count > maximum {
            return Err(checkpoint_error(
                LocalLogCheckpointResourceLimit::ReplayTombstones { actual: actual_count, maximum }
                    .into(),
            ));
        }

        let mut encoded = vec![""; parts.compacted_replays.len()];
        for (replay_id, sequence) in parts.compacted_replays {
            let index = usize::try_from(sequence.get() - 1).map_err(|_| {
                checkpoint_error(runtime_invariant("runtime tombstone index does not fit usize"))
            })?;
            let Some(slot) = encoded.get_mut(index) else {
                return Err(checkpoint_error(runtime_invariant(
                    "runtime replay tombstone sequence exceeds the covered frontier",
                )));
            };
            if !slot.is_empty() {
                return Err(checkpoint_error(runtime_invariant(
                    "runtime replay tombstone sequence is duplicated",
                )));
            }
            *slot = replay_id.as_str();
        }
        if encoded.iter().any(|replay_id| replay_id.is_empty()) {
            return Err(checkpoint_error(runtime_invariant(
                "runtime replay tombstones are not a complete contiguous sequence",
            )));
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
#[serde(deny_unknown_fields)]
struct BorrowedSchemaIdRecord<'a> {
    #[serde(borrow)]
    name: Cow<'a, str>,
    version: u32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BorrowedLocalLogCheckpointRecordV3<'a> {
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

fn decode_json<'de, T>(json: &'de str) -> Result<T, LocalLogCheckpointV3CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(LocalLogCheckpointV3CodecError::InvalidJson)
}

fn decode_schema_id(
    schema: &BorrowedSchemaIdRecord<'_>,
) -> Result<SchemaId, LocalLogCheckpointV3CodecError> {
    let name = QualifiedName::try_new(schema.name.as_ref()).map_err(|source| {
        LocalLogCheckpointV3CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(schema.version).map_err(|source| {
        LocalLogCheckpointV3CodecError::InvalidSchemaVersion { value: schema.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn validate_nested_session_header(raw: &RawValue) -> Result<(), LocalLogCheckpointV3CodecError> {
    validate_nested_session_header_json(raw.get())
}

fn validate_nested_session_header_json(json: &str) -> Result<(), LocalLogCheckpointV3CodecError> {
    let header: BorrowedNestedSessionCheckpointHeader<'_> = serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(SessionCheckpointV3CodecError::InvalidJson)
        .map_err(nested_session_error)?;
    if header.format != SESSION_CHECKPOINT_FORMAT {
        return Err(nested_session_error(SessionCheckpointV3CodecError::UnsupportedFormat {
            found: BoundedDiagnostic::from(header.format.as_ref()),
            expected: SESSION_CHECKPOINT_FORMAT,
        }));
    }
    if header.format_version != SESSION_CHECKPOINT_V3_FORMAT_VERSION {
        return Err(nested_session_error(
            SessionCheckpointV3CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: SESSION_CHECKPOINT_V3_FORMAT_VERSION,
            },
        ));
    }
    Ok(())
}

fn checkpoint_error(source: LocalLogCheckpointCodecError) -> LocalLogCheckpointV3CodecError {
    LocalLogCheckpointV3CodecError::InvalidCheckpoint(Box::new(source))
}

fn checkpoint_result<T>(
    result: Result<T, LocalLogCheckpointCodecError>,
) -> Result<T, LocalLogCheckpointV3CodecError> {
    result.map_err(checkpoint_error)
}

fn nested_session_error(source: SessionCheckpointV3CodecError) -> LocalLogCheckpointV3CodecError {
    LocalLogCheckpointV3CodecError::InvalidSessionCheckpoint(Box::new(source))
}
