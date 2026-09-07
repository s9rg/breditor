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
    LocalLogCheckpointV2CodecError, SESSION_CHECKPOINT_FORMAT,
    SESSION_CHECKPOINT_V2_FORMAT_VERSION, SessionCheckpointJsonCodecV2,
    SessionCheckpointV2CodecError,
    json_size::JsonByteCounter,
    local_log_checkpoint_encoding_v2::LocalLogCheckpointEncodingV2,
    local_log_checkpoint_json::{
        LOCAL_LOG_CHECKPOINT_FORMAT, anchor_invariant_error, decode_checkpoint_log_id,
        decode_covered_through, decode_session_id, decode_successor_log_id, runtime_invariant,
        validate_binding_field,
    },
    local_log_checkpoint_tombstones_v1::{count_replay_tombstones, decode_replay_tombstones},
};

/// Wire version accepted and emitted by [`LocalLogCheckpointJsonCodecV2`].
pub const LOCAL_LOG_CHECKPOINT_V2_FORMAT_VERSION: u32 = 2;

const _: () = assert!(SESSION_CHECKPOINT_V2_FORMAT_VERSION == 2);

/// Strict fingerprint-bound codec for one compacted local-log prefix.
///
/// V2 repeats the complete schema binding at the outer boundary and embeds a
/// Session Checkpoint V2 by value. The independently supplied session and log
/// identity binding remains mandatory; neither wire assertion is authority.
#[derive(Clone, Debug)]
pub struct LocalLogCheckpointJsonCodecV2 {
    expected: LocalLogCheckpointBinding,
    limits: LocalLogCheckpointLimits,
    session_codec: SessionCheckpointJsonCodecV2,
}

impl LocalLogCheckpointJsonCodecV2 {
    /// Creates a V2 codec bound to one runtime context and trusted log scope.
    #[must_use]
    pub fn new(context: EditorContext, expected: LocalLogCheckpointBinding) -> Self {
        Self {
            expected,
            limits: LocalLogCheckpointLimits::default(),
            session_codec: SessionCheckpointJsonCodecV2::new(context),
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

    /// Strictly decodes one complete Local Log Checkpoint V2 value.
    ///
    /// Routing and the exact borrowed outer shape are checked before the schema
    /// selector and fingerprint. The durable binding is admitted before any log
    /// identity allocation, tombstone allocation, or nested session replay.
    /// The caller's JSON is only borrowed and is never consumed or rewritten.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCheckpointV2CodecError`] for malformed or mismatched
    /// bindings, untrusted identity disagreement, invalid topology or values,
    /// resource-limit excess, or an invalid nested Session Checkpoint V2.
    pub fn decode(
        &self,
        json: &str,
    ) -> Result<LocalLogCheckpointAnchor, LocalLogCheckpointV2CodecError> {
        let maximum = self.context().limits().max_json_bytes();
        if json.len() > maximum {
            return Err(LocalLogCheckpointV2CodecError::InputTooLarge {
                actual: json.len(),
                maximum,
            });
        }

        let header: BorrowedLocalLogCheckpointHeader<'_> = decode_json(json)?;
        if header.format != LOCAL_LOG_CHECKPOINT_FORMAT {
            return Err(LocalLogCheckpointV2CodecError::UnsupportedFormat {
                found: BoundedDiagnostic::from(header.format.as_ref()),
                expected: LOCAL_LOG_CHECKPOINT_FORMAT,
            });
        }
        if header.format_version != LOCAL_LOG_CHECKPOINT_V2_FORMAT_VERSION {
            return Err(LocalLogCheckpointV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: LOCAL_LOG_CHECKPOINT_V2_FORMAT_VERSION,
            });
        }

        let envelope: BorrowedLocalLogCheckpointRecordV2<'_> = decode_json(json)?;
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

    /// Encodes one checked anchor into deterministic compact V2 JSON.
    ///
    /// Encoding rechecks the runtime context, retained log identities,
    /// topology, limits, and nested Session Checkpoint V2 proof. It never emits
    /// a V1 nested session.
    ///
    /// # Errors
    ///
    /// Returns [`LocalLogCheckpointV2CodecError`] for context or log-binding
    /// mismatch, invalid private topology, nested-session failure, serialization
    /// failure, or output exceeding the shared byte budget.
    pub fn encode(
        &self,
        anchor: &LocalLogCheckpointAnchor,
    ) -> Result<String, LocalLogCheckpointV2CodecError> {
        let parts = anchor.checkpoint_parts();
        if parts.session.state().context() != self.context() {
            return Err(LocalLogCheckpointV2CodecError::ContextConfigurationMismatch);
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
                SessionCheckpointV2CodecError::ContextConfigurationMismatch => {
                    LocalLogCheckpointV2CodecError::ContextConfigurationMismatch
                }
                SessionCheckpointV2CodecError::OutputTooLarge { minimum, maximum } => {
                    LocalLogCheckpointV2CodecError::OutputTooLarge { minimum, maximum }
                }
                source => nested_session_error(source),
            })?;
        validate_nested_session_header_json(&session_json)?;
        let session_checkpoint = RawValue::from_string(session_json)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogCheckpointV2CodecError::Encoding)?;

        let encoding = LocalLogCheckpointEncodingV2 {
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
            return Err(LocalLogCheckpointV2CodecError::OutputTooLarge {
                minimum: byte_counter.bytes(),
                maximum,
            });
        }
        count_result
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogCheckpointV2CodecError::Encoding)?;
        serde_json::to_string(&encoding)
            .map_err(|error| JsonFailure::from_serde(&error))
            .map_err(LocalLogCheckpointV2CodecError::Encoding)
    }

    fn validate_binding(
        &self,
        session_id: &crate::local_log::LocalSessionId,
        checkpoint_log_id: &crate::local_log::LocalLogId,
        successor_log_id: &crate::local_log::LocalLogId,
    ) -> Result<(), LocalLogCheckpointV2CodecError> {
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
    ) -> Result<Vec<&'a str>, LocalLogCheckpointV2CodecError> {
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
struct BorrowedLocalLogCheckpointRecordV2<'a> {
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

fn decode_json<'de, T>(json: &'de str) -> Result<T, LocalLogCheckpointV2CodecError>
where
    T: Deserialize<'de>,
{
    serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(LocalLogCheckpointV2CodecError::InvalidJson)
}

fn decode_schema_id(
    schema: &BorrowedSchemaIdRecord<'_>,
) -> Result<SchemaId, LocalLogCheckpointV2CodecError> {
    let name = QualifiedName::try_new(schema.name.as_ref()).map_err(|source| {
        LocalLogCheckpointV2CodecError::InvalidSchemaName {
            value: BoundedDiagnostic::from(schema.name.as_ref()),
            source,
        }
    })?;
    let version = SchemaVersion::try_new(schema.version).map_err(|source| {
        LocalLogCheckpointV2CodecError::InvalidSchemaVersion { value: schema.version, source }
    })?;
    Ok(SchemaId::new(name, version))
}

fn validate_nested_session_header(raw: &RawValue) -> Result<(), LocalLogCheckpointV2CodecError> {
    validate_nested_session_header_json(raw.get())
}

fn validate_nested_session_header_json(json: &str) -> Result<(), LocalLogCheckpointV2CodecError> {
    let header: BorrowedNestedSessionCheckpointHeader<'_> = serde_json::from_str(json)
        .map_err(|error| JsonFailure::from_serde(&error))
        .map_err(SessionCheckpointV2CodecError::InvalidJson)
        .map_err(nested_session_error)?;
    if header.format != SESSION_CHECKPOINT_FORMAT {
        return Err(nested_session_error(SessionCheckpointV2CodecError::UnsupportedFormat {
            found: BoundedDiagnostic::from(header.format.as_ref()),
            expected: SESSION_CHECKPOINT_FORMAT,
        }));
    }
    if header.format_version != SESSION_CHECKPOINT_V2_FORMAT_VERSION {
        return Err(nested_session_error(
            SessionCheckpointV2CodecError::UnsupportedFormatVersion {
                found: header.format_version,
                supported: SESSION_CHECKPOINT_V2_FORMAT_VERSION,
            },
        ));
    }
    Ok(())
}

fn checkpoint_error(source: LocalLogCheckpointCodecError) -> LocalLogCheckpointV2CodecError {
    LocalLogCheckpointV2CodecError::InvalidCheckpoint(Box::new(source))
}

fn checkpoint_result<T>(
    result: Result<T, LocalLogCheckpointCodecError>,
) -> Result<T, LocalLogCheckpointV2CodecError> {
    result.map_err(checkpoint_error)
}

fn nested_session_error(source: SessionCheckpointV2CodecError) -> LocalLogCheckpointV2CodecError {
    LocalLogCheckpointV2CodecError::InvalidSessionCheckpoint(Box::new(source))
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, error::Error};

    use crate::{
        codec::{DocumentJsonCodecV2, LocalLogCheckpointJsonCodec},
        local_log::{
            LocalLogCheckpointAnchor, LocalLogCheckpointBinding, LocalLogCompactionLimits,
            LocalLogId, LocalSessionId,
        },
        schema::{CompiledSchema, DocumentLimits, SchemaBindingError},
        session::EditorSession,
        state::{EditorContext, EditorState, LineageId},
    };

    use super::{LocalLogCheckpointJsonCodecV2, LocalLogCheckpointV2CodecError};

    #[test]
    fn variant_binding_round_trips_while_base_and_v1_reject_it() -> Result<(), Box<dyn Error>> {
        let schema = CompiledSchema::test_semantic_variant_same_id();
        let fingerprint = schema.fingerprint().to_string();
        let context = EditorContext::new(schema, DocumentLimits::default());
        let document_json = format!(
            concat!(
                r#"{{"format":"breditor/document","formatVersion":2,"#,
                r#""schema":{{"name":"breditor/base","version":1}},"#,
                r#""schemaFingerprint":"{}","root":{{"kind":"element","#,
                r#""type":"breditor/document","entityId":null,"properties":{{}},"#,
                r#""children":[{{"kind":"element","type":"breditor/paragraph","#,
                r#""entityId":null,"properties":{{}},"children":[]}},"#,
                r#"{{"kind":"element","type":"breditor/paragraph","entityId":null,"#,
                r#""properties":{{}},"children":[]}}]}}}}"#,
            ),
            fingerprint,
        );
        let document = DocumentJsonCodecV2::new(context.schema().clone()).decode(&document_json)?;
        let state = EditorState::try_new(
            &context,
            LineageId::try_new("checkpoint-v2-variant")?,
            document,
            None,
            None,
        )?;
        let session_id = LocalSessionId::try_new("session:checkpoint-v2-variant")?;
        let checkpoint_log_id = LocalLogId::try_new("log:checkpoint-v2-variant-prefix")?;
        let successor_log_id = LocalLogId::try_new("log:checkpoint-v2-variant-successor")?;
        let binding = LocalLogCheckpointBinding::try_new(
            session_id.clone(),
            checkpoint_log_id.clone(),
            successor_log_id.clone(),
        )?;
        let anchor = LocalLogCheckpointAnchor::try_from_checkpoint_parts(
            session_id,
            checkpoint_log_id,
            successor_log_id,
            LocalLogCompactionLimits::default(),
            EditorSession::new(state),
            BTreeMap::new(),
            None,
        )
        .map_err(super::anchor_invariant_error)?;
        let variant = LocalLogCheckpointJsonCodecV2::new(context.clone(), binding.clone());
        let encoded = variant.encode(&anchor)?;
        let decoded = variant.decode(&encoded)?;
        assert_eq!(decoded.schema_binding(), context.schema().durable_binding());

        assert!(matches!(
            LocalLogCheckpointJsonCodecV2::new(EditorContext::default(), binding.clone())
                .decode(&encoded),
            Err(LocalLogCheckpointV2CodecError::SchemaBinding(
                SchemaBindingError::SchemaFingerprintMismatch { .. }
            ))
        ));
        assert!(matches!(
            LocalLogCheckpointJsonCodec::new(context, binding).encode(&anchor),
            Err(crate::codec::LocalLogCheckpointCodecError::ContextConfigurationMismatch)
        ));
        Ok(())
    }
}
