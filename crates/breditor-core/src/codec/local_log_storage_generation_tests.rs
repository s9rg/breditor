use std::error::Error;

use serde_json::Value;

use crate::{
    codec::{
        CodecErrorCode, DocumentJsonCodec, LocalLogCheckpointJsonCodec, LocalLogFrameLimits,
        LocalLogStorageGenerationBinding, LocalLogStorageGenerationBindingField,
        LocalLogStorageGenerationCodecError, LocalLogStorageGenerationContinuityError,
        LocalLogStorageGenerationJsonCodec, LocalLogStorageGenerationLimits,
        LocalLogStorageGenerationManifest, LocalLogStorageGenerationManifestParts,
        LocalLogStorageGenerationPreparationInputs, LocalLogStorageGenerationRecordErrorCode,
        LocalLogStorageGenerationRecordLocation, LocalLogStorageGenerationResourceLimit,
        LocalLogStorageGenerationTopologyError,
    },
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryLimits, LocalLogStorageFenceId, LocalLogStorageHeadId,
        LocalLogStorageProfileId, LocalLogStorageProfileVersion, LocalLogStorageScopeId,
        LocalLogStorageTransactionId, LocalSessionId,
    },
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

struct RotationFixture {
    context: EditorContext,
    binding: LocalLogStorageGenerationBinding,
    prior: LocalLogStorageGenerationManifest,
    outcome: super::LocalLogTailCompactionOutcome,
    inputs: LocalLogStorageGenerationPreparationInputs,
}

impl RotationFixture {
    fn new() -> TestResult<Self> {
        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(
                r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}]}}"#,
            )?;
        let state = EditorState::try_new(
            &context,
            LineageId::try_new("storage-generation-tests")?,
            document,
            None,
            None,
        )?;
        let session_id = LocalSessionId::try_new("session:storage-generation")?;
        let sealed_log_id = LocalLogId::try_new("log:storage-generation:g0")?;
        let active_log_id = LocalLogId::try_new("log:storage-generation:g1")?;
        let successor_log_id = LocalLogId::try_new("log:storage-generation:g2")?;
        let prior_anchor = LocalLogRecovery::new(session_id.clone(), sealed_log_id.clone())
            .recover(EditorSession::new(state), Vec::new())?
            .try_into_checkpoint_anchor(
                active_log_id.clone(),
                LocalLogCompactionLimits::default(),
            )?;
        let prior_checkpoint = LocalLogCheckpointJsonCodec::new(
            context.clone(),
            LocalLogCheckpointBinding::try_new(
                session_id.clone(),
                sealed_log_id.clone(),
                active_log_id.clone(),
            )?,
        )
        .encode(&prior_anchor)?;
        let active_frame_limits = LocalLogFrameLimits::new(4_096);
        let fresh_cursor = prior_anchor
            .begin_successor_tail(LocalLogRecoveryLimits::default(), active_frame_limits);
        let (owner, _, retained_frame_limits) = fresh_cursor.into_parts();
        let outcome =
            super::LocalLogTailCursor::from_trusted_parts(owner, 123, retained_frame_limits)
                .try_into_checkpoint_anchor(successor_log_id.clone())?;

        let profile_id = LocalLogStorageProfileId::try_new("breditor/test-storage")?;
        let profile_version = LocalLogStorageProfileVersion::try_new(1)?;
        let scope_id = LocalLogStorageScopeId::try_new("scope:storage-generation")?;
        let old_head_id = LocalLogStorageHeadId::try_new("head:storage-generation:h0")?;
        let expected_head_id = LocalLogStorageHeadId::try_new("head:storage-generation:h1")?;
        let committed_head_id = LocalLogStorageHeadId::try_new("head:storage-generation:h2")?;
        let prior =
            LocalLogStorageGenerationManifest::from_parts(LocalLogStorageGenerationManifestParts {
                profile_id: profile_id.clone(),
                profile_version,
                scope_id: scope_id.clone(),
                transaction_id: LocalLogStorageTransactionId::try_new(
                    "transaction:storage-generation:t1",
                )?,
                expected_head_id: old_head_id,
                committed_head_id: expected_head_id.clone(),
                fence_id: LocalLogStorageFenceId::try_new("fence:storage-generation:f1")?,
                session_id,
                sealed_log_id,
                successor_log_id: active_log_id,
                accepted_prefix_bytes: 0,
                sealed_frame: super::LocalLogStorageGenerationFrameV1::new(
                    LocalLogFrameLimits::new(2_048),
                ),
                successor_frame: super::LocalLogStorageGenerationFrameV1::new(active_frame_limits),
                checkpoint_json: prior_checkpoint,
            });
        let binding = LocalLogStorageGenerationBinding::try_new(
            profile_id,
            profile_version,
            scope_id,
            expected_head_id,
            committed_head_id,
        )?;
        let inputs = LocalLogStorageGenerationPreparationInputs::new(
            LocalLogStorageTransactionId::try_new("transaction:storage-generation:t2")?,
            LocalLogStorageFenceId::try_new("fence:storage-generation:f2")?,
            LocalLogFrameLimits::new(8_192),
        );
        Ok(Self { context, binding, prior, outcome, inputs })
    }

    fn codec(&self) -> LocalLogStorageGenerationJsonCodec {
        LocalLogStorageGenerationJsonCodec::new(self.context.clone(), self.binding.clone())
    }

    fn prepared(
        &self,
    ) -> Result<LocalLogStorageGenerationManifest, LocalLogStorageGenerationCodecError> {
        self.codec().prepare_rotation(&self.prior, &self.outcome, &self.inputs)
    }

    fn encoded(
        &self,
    ) -> Result<(LocalLogStorageGenerationManifest, String), LocalLogStorageGenerationCodecError>
    {
        let manifest = self.prepared()?;
        let encoded = self.codec().encode_rotation(&manifest, &self.prior)?;
        Ok((manifest, encoded))
    }
}

fn copied_manifest_parts(
    value: &LocalLogStorageGenerationManifest,
) -> LocalLogStorageGenerationManifestParts {
    LocalLogStorageGenerationManifestParts {
        profile_id: value.profile_id().clone(),
        profile_version: value.profile_version(),
        scope_id: value.scope_id().clone(),
        transaction_id: value.transaction_id().clone(),
        expected_head_id: value.expected_head_id().clone(),
        committed_head_id: value.committed_head_id().clone(),
        fence_id: value.fence_id().clone(),
        session_id: value.session_id().clone(),
        sealed_log_id: value.sealed_log_id().clone(),
        successor_log_id: value.successor_log_id().clone(),
        accepted_prefix_bytes: value.accepted_prefix_bytes(),
        sealed_frame: value.sealed_frame(),
        successor_frame: value.successor_frame(),
        checkpoint_json: value.checkpoint_json().to_owned(),
    }
}

#[test]
fn prepare_encode_and_decode_form_one_exact_rotation_boundary() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (manifest, encoded) = fixture.encoded()?;

    assert_eq!(manifest.profile_id(), fixture.binding.profile_id());
    assert_eq!(manifest.profile_version(), fixture.binding.profile_version());
    assert_eq!(manifest.scope_id(), fixture.binding.scope_id());
    assert_eq!(manifest.expected_head_id(), fixture.binding.expected_head_id());
    assert_eq!(manifest.committed_head_id(), fixture.binding.committed_head_id());
    assert_eq!(manifest.transaction_id(), fixture.inputs.transaction_id());
    assert_eq!(manifest.fence_id(), fixture.inputs.fence_id());
    assert_eq!(manifest.accepted_prefix_bytes(), fixture.outcome.accepted_prefix_bytes());
    assert_eq!(manifest.sealed_frame().limits(), fixture.outcome.frame_limits());
    assert_eq!(manifest.successor_frame().limits(), fixture.inputs.successor_frame_limits());
    assert!(encoded.starts_with(
        r#"{"format":"breditor/local-log-storage-generation","formatVersion":1,"profileId":"#,
    ));
    let transaction = encoded.find("\"transactionId\"").ok_or("missing transaction field")?;
    let heads = encoded.find("\"expectedHeadId\"").ok_or("missing expected head field")?;
    let checkpoint = encoded.find("\"checkpointJson\"").ok_or("missing checkpoint field")?;
    assert!(transaction < heads && heads < checkpoint);

    let decoded = fixture.codec().decode_rotation(&encoded, &fixture.prior)?;
    assert_eq!(decoded, manifest);
    assert_eq!(fixture.codec().encode_rotation(&decoded, &fixture.prior)?, encoded);

    let debug = format!("{manifest:?}");
    assert!(debug.contains("checkpoint_json_bytes"));
    assert!(!debug.contains(manifest.checkpoint_json()));
    Ok(())
}

#[test]
fn input_output_and_checkpoint_limits_are_independent_and_exact() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (manifest, encoded) = fixture.encoded()?;
    let checkpoint_bytes = manifest.checkpoint_json_bytes();

    let decode_with_zero_output = fixture
        .codec()
        .with_limits(LocalLogStorageGenerationLimits::default().with_max_output_bytes(0));
    assert_eq!(decode_with_zero_output.decode_rotation(&encoded, &fixture.prior)?, manifest);
    assert!(matches!(
        decode_with_zero_output.encode_rotation(&manifest, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::OutputTooLarge { maximum: 0, .. })
    ));

    let prepare_with_zero_input = fixture
        .codec()
        .with_limits(LocalLogStorageGenerationLimits::default().with_max_input_bytes(0));
    let prepared = prepare_with_zero_input.prepare_rotation(
        &fixture.prior,
        &fixture.outcome,
        &fixture.inputs,
    )?;
    assert_eq!(prepare_with_zero_input.encode_rotation(&prepared, &fixture.prior)?, encoded);

    let exact = fixture.codec().with_limits(
        LocalLogStorageGenerationLimits::default()
            .with_max_input_bytes(encoded.len())
            .with_max_output_bytes(encoded.len())
            .with_max_checkpoint_json_bytes(checkpoint_bytes),
    );
    assert_eq!(exact.decode_rotation(&encoded, &fixture.prior)?, manifest);
    assert_eq!(exact.encode_rotation(&manifest, &fixture.prior)?, encoded);

    let short_input = fixture.codec().with_limits(
        LocalLogStorageGenerationLimits::default().with_max_input_bytes(encoded.len() - 1),
    );
    assert!(matches!(
        short_input.decode_rotation(&encoded, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::InputTooLarge { .. })
    ));
    let short_checkpoint = fixture.codec().with_limits(
        LocalLogStorageGenerationLimits::default()
            .with_max_checkpoint_json_bytes(checkpoint_bytes - 1),
    );
    assert!(matches!(
        short_checkpoint.decode_rotation(&encoded, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::ResourceLimit(
            LocalLogStorageGenerationResourceLimit::CheckpointJsonBytes { .. }
        ))
    ));
    assert!(matches!(
        short_checkpoint.prepare_rotation(&fixture.prior, &fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageGenerationCodecError::ResourceLimit(
            LocalLogStorageGenerationResourceLimit::CheckpointJsonBytes { .. }
        ))
    ));

    let short_output = fixture.codec().with_limits(
        LocalLogStorageGenerationLimits::default().with_max_output_bytes(encoded.len() - 1),
    );
    assert!(matches!(
        short_output.prepare_rotation(&fixture.prior, &fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageGenerationCodecError::OutputTooLarge { .. })
    ));
    Ok(())
}

#[test]
fn outer_canonicality_rejects_whitespace_order_and_equivalent_escapes() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (_, encoded) = fixture.encoded()?;

    for altered in [format!(" {encoded}"), format!("{encoded}\n")] {
        assert!(matches!(
            fixture.codec().decode_rotation(&altered, &fixture.prior),
            Err(LocalLogStorageGenerationCodecError::NonCanonicalManifestJson)
        ));
    }

    let reordered = encoded.replacen(
        r#"{"format":"breditor/local-log-storage-generation","formatVersion":1"#,
        r#"{"formatVersion":1,"format":"breditor/local-log-storage-generation""#,
        1,
    );
    assert_ne!(reordered, encoded);
    let Err(reordered_error) = fixture.codec().decode_rotation(&reordered, &fixture.prior) else {
        return Err("reordered manifest was accepted".into());
    };
    assert!(
        matches!(reordered_error, LocalLogStorageGenerationCodecError::NonCanonicalManifestJson),
        "unexpected reordered-manifest failure: {reordered_error:?}"
    );

    let escaped =
        encoded.replacen("breditor/local-log-checkpoint", r"\u0062reditor/local-log-checkpoint", 1);
    assert_ne!(escaped, encoded);
    assert!(matches!(
        fixture.codec().decode_rotation(&escaped, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::NonCanonicalManifestJson)
    ));
    Ok(())
}

#[test]
fn nested_checkpoint_must_be_valid_and_byte_canonical_before_outer_canonicality() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (manifest, encoded) = fixture.encoded()?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["checkpointJson"] = Value::String(format!(" {}", manifest.checkpoint_json()));
    let noncanonical_nested = serde_json::to_string(&value)?;
    assert!(matches!(
        fixture.codec().decode_rotation(&noncanonical_nested, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::NonCanonicalCheckpointJson)
    ));

    value["checkpointJson"] = Value::String(String::from("not-json"));
    let invalid_nested = serde_json::to_string(&value)?;
    assert!(matches!(
        fixture.codec().decode_rotation(&invalid_nested, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::InvalidCheckpoint(_))
    ));
    Ok(())
}

#[test]
fn strict_shape_types_and_semantic_fields_keep_distinct_error_categories() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let mut value: Value = serde_json::from_str(&encoded)?;

    value["unexpected"] = Value::Bool(true);
    let unknown = serde_json::to_string(&value)?;
    let Err(unknown_error) = fixture.codec().decode_rotation(&unknown, &fixture.prior) else {
        return Err("unknown manifest field was accepted".into());
    };
    assert_eq!(unknown_error.code(), CodecErrorCode::InvalidJson);
    value.as_object_mut().ok_or("manifest was not an object")?.remove("unexpected");

    value["profileVersion"] = Value::String(String::from("1"));
    let wrong_type = serde_json::to_string(&value)?;
    assert!(matches!(
        fixture.codec().decode_rotation(&wrong_type, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::InvalidJson(_))
    ));

    value["profileVersion"] = Value::from(0_u64);
    let zero = serde_json::to_string(&value)?;
    let Err(error) = fixture.codec().decode_rotation(&zero, &fixture.prior) else {
        return Err("zero profile version was accepted".into());
    };
    let LocalLogStorageGenerationCodecError::InvalidRecord(record) = error else {
        return Err("zero profile version used the wrong error category".into());
    };
    assert_eq!(record.code(), LocalLogStorageGenerationRecordErrorCode::InvalidProfileVersion);
    Ok(())
}

#[test]
fn topology_binding_and_continuity_checks_have_fail_closed_precedence() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let mut value: Value = serde_json::from_str(&encoded)?;

    value["committedHeadId"] = value["expectedHeadId"].clone();
    let equal_heads = serde_json::to_string(&value)?;
    assert!(matches!(
        fixture.codec().decode_rotation(&equal_heads, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::InvalidTopology(
            LocalLogStorageGenerationTopologyError::HeadNotAdvanced
        ))
    ));

    value = serde_json::from_str(&encoded)?;
    value["profileId"] = Value::String(String::from("breditor/other-storage"));
    let wrong_binding = serde_json::to_string(&value)?;
    assert!(matches!(
        fixture.codec().decode_rotation(&wrong_binding, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::BindingMismatch {
            field: LocalLogStorageGenerationBindingField::ProfileId
        })
    ));

    value = serde_json::from_str(&encoded)?;
    value["transactionId"] = Value::String(fixture.prior.transaction_id().as_str().to_owned());
    let reused_transaction = serde_json::to_string(&value)?;
    assert!(matches!(
        fixture.codec().decode_rotation(&reused_transaction, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::TransactionIdReused
        ))
    ));

    value = serde_json::from_str(&encoded)?;
    value["successorLogId"] = Value::String(fixture.prior.sealed_log_id().as_str().to_owned());
    let reused_generation = serde_json::to_string(&value)?;
    assert!(matches!(
        fixture.codec().decode_rotation(&reused_generation, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::KnownGenerationIdReused
        ))
    ));
    Ok(())
}

#[test]
fn preparation_rejects_known_identity_reuse_before_nested_checkpoint_work() -> TestResult {
    let fixture = RotationFixture::new()?;
    let reused_transaction = LocalLogStorageGenerationPreparationInputs::new(
        fixture.prior.transaction_id().clone(),
        LocalLogStorageFenceId::try_new("fence:storage-generation:reused-transaction")?,
        LocalLogFrameLimits::new(1),
    );
    assert!(matches!(
        fixture.codec().prepare_rotation(&fixture.prior, &fixture.outcome, &reused_transaction),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::TransactionIdReused
        ))
    ));

    let reused_head_binding = LocalLogStorageGenerationBinding::try_new(
        fixture.binding.profile_id().clone(),
        fixture.binding.profile_version(),
        fixture.binding.scope_id().clone(),
        fixture.prior.committed_head_id().clone(),
        fixture.prior.expected_head_id().clone(),
    )?;
    let codec =
        LocalLogStorageGenerationJsonCodec::new(fixture.context.clone(), reused_head_binding);
    assert!(matches!(
        codec.prepare_rotation(&fixture.prior, &fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::KnownHeadIdReused
        ))
    ));
    Ok(())
}

#[test]
fn preparation_cross_checks_prior_context_and_every_outcome_association() -> TestResult {
    let fixture = RotationFixture::new()?;

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.profile_id = LocalLogStorageProfileId::try_new("breditor/other-profile")?;
    let wrong_profile = LocalLogStorageGenerationManifest::from_parts(parts);
    assert!(matches!(
        fixture.codec().prepare_rotation(&wrong_profile, &fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageGenerationCodecError::BindingMismatch {
            field: LocalLogStorageGenerationBindingField::ProfileId
        })
    ));

    let wrong_context = fixture.context.clone().with_max_operations_per_transaction(
        fixture.context.max_operations_per_transaction().saturating_add(1),
    );
    let wrong_context_codec =
        LocalLogStorageGenerationJsonCodec::new(wrong_context, fixture.binding.clone());
    assert!(matches!(
        wrong_context_codec.prepare_rotation(&fixture.prior, &fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageGenerationCodecError::ContextConfigurationMismatch)
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.session_id = LocalSessionId::try_new("session:other")?;
    let wrong_session = LocalLogStorageGenerationManifest::from_parts(parts);
    assert!(matches!(
        fixture.codec().prepare_rotation(&wrong_session, &fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageGenerationCodecError::BindingMismatch {
            field: LocalLogStorageGenerationBindingField::SessionId
        })
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.successor_log_id = LocalLogId::try_new("log:other-prior-successor")?;
    let wrong_sealed_log = LocalLogStorageGenerationManifest::from_parts(parts);
    assert!(matches!(
        fixture.codec().prepare_rotation(&wrong_sealed_log, &fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageGenerationCodecError::BindingMismatch {
            field: LocalLogStorageGenerationBindingField::SealedLogId
        })
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.successor_frame = super::LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(
        fixture.outcome.frame_limits().max_payload_bytes() + 1,
    ));
    let wrong_sealed_frame = LocalLogStorageGenerationManifest::from_parts(parts);
    assert!(matches!(
        fixture.codec().prepare_rotation(&wrong_sealed_frame, &fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageGenerationCodecError::BindingMismatch {
            field: LocalLogStorageGenerationBindingField::SealedFrame
        })
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.sealed_log_id = fixture.outcome.anchor().successor_log_id().clone();
    let reused_generation = LocalLogStorageGenerationManifest::from_parts(parts);
    assert!(matches!(
        fixture.codec().prepare_rotation(&reused_generation, &fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::KnownGenerationIdReused
        ))
    ));
    Ok(())
}

#[test]
fn codec_remains_reusable_after_a_rejected_decode() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (manifest, encoded) = fixture.encoded()?;
    let codec = fixture.codec();
    assert!(codec.decode_rotation("{}", &fixture.prior).is_err());
    assert_eq!(codec.decode_rotation(&encoded, &fixture.prior)?, manifest);
    Ok(())
}

#[test]
fn complete_v1_wire_bytes_are_golden_including_every_json_escape_class() -> TestResult {
    let manifest = LocalLogStorageGenerationManifest::from_parts(
        LocalLogStorageGenerationManifestParts {
            profile_id: LocalLogStorageProfileId::try_new("breditor/golden")?,
            profile_version: LocalLogStorageProfileVersion::try_new(u32::MAX)?,
            scope_id: LocalLogStorageScopeId::try_new("scope:golden")?,
            transaction_id: LocalLogStorageTransactionId::try_new("transaction:golden")?,
            expected_head_id: LocalLogStorageHeadId::try_new("head:old")?,
            committed_head_id: LocalLogStorageHeadId::try_new("head:new")?,
            fence_id: LocalLogStorageFenceId::try_new("fence:golden")?,
            session_id: LocalSessionId::try_new("session:golden")?,
            sealed_log_id: LocalLogId::try_new("log:old")?,
            successor_log_id: LocalLogId::try_new("log:new")?,
            accepted_prefix_bytes: u64::MAX,
            sealed_frame: super::LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(0)),
            successor_frame: super::LocalLogStorageGenerationFrameV1::new(
                LocalLogFrameLimits::new(u64::MAX),
            ),
            checkpoint_json: String::from(
                "quote\" slash/ backslash\\ controls:\u{0008}\u{000c}\n\r\t nul:\0 unicode:é😀\u{2028}",
            ),
        },
    );
    let actual = serde_json::to_string(
        &super::local_log_storage_generation_json::manifest_record(&manifest),
    )?;
    let expected =
        include_str!("fixtures/local_log_storage_generation_v1_serde_json_1_0_151_golden.json")
            .trim_end_matches('\n');

    assert_eq!(actual, expected);
    Ok(())
}

#[test]
fn every_outer_and_frame_member_is_required_unique_and_closed() -> TestResult {
    const OUTER_FIELDS: [&str; 16] = [
        "format",
        "formatVersion",
        "profileId",
        "profileVersion",
        "scopeId",
        "transactionId",
        "expectedHeadId",
        "committedHeadId",
        "fenceId",
        "sessionId",
        "sealedLogId",
        "successorLogId",
        "acceptedPrefixBytes",
        "sealedFrame",
        "successorFrame",
        "checkpointJson",
    ];
    let fixture = RotationFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let canonical: Value = serde_json::from_str(&encoded)?;

    for field in OUTER_FIELDS {
        let mut missing = canonical.clone();
        let Some(removed) = missing.as_object_mut().and_then(|object| object.remove(field)) else {
            return Err(format!("golden manifest lacked {field}").into());
        };
        let missing = serde_json::to_string(&missing)?;
        assert!(
            matches!(
                fixture.codec().decode_rotation(&missing, &fixture.prior),
                Err(LocalLogStorageGenerationCodecError::InvalidJson(_))
            ),
            "missing outer field was not rejected as strict JSON: {field}"
        );

        let encoded_field = serde_json::to_string(field)?;
        let encoded_value = serde_json::to_string(&removed)?;
        let Some(prefix) = encoded.strip_suffix('}') else {
            return Err("canonical manifest lacked its final object delimiter".into());
        };
        let duplicate = format!("{prefix},{encoded_field}:{encoded_value}}}");
        assert!(
            matches!(
                fixture.codec().decode_rotation(&duplicate, &fixture.prior),
                Err(LocalLogStorageGenerationCodecError::InvalidJson(_))
            ),
            "duplicate outer field was not rejected as strict JSON: {field}"
        );
    }

    for frame in ["sealedFrame", "successorFrame"] {
        for field in ["formatVersion", "maxPayloadBytes"] {
            let mut missing = canonical.clone();
            let Some(frame_object) = missing.get_mut(frame).and_then(Value::as_object_mut) else {
                return Err(format!("manifest lacked {frame}").into());
            };
            frame_object.remove(field);
            let missing = serde_json::to_string(&missing)?;
            assert!(matches!(
                fixture.codec().decode_rotation(&missing, &fixture.prior),
                Err(LocalLogStorageGenerationCodecError::InvalidJson(_))
            ));
        }

        let mut unknown = canonical.clone();
        let Some(frame_object) = unknown.get_mut(frame).and_then(Value::as_object_mut) else {
            return Err(format!("manifest lacked {frame}").into());
        };
        frame_object.insert(String::from("unexpected"), Value::Bool(true));
        let unknown = serde_json::to_string(&unknown)?;
        assert!(matches!(
            fixture.codec().decode_rotation(&unknown, &fixture.prior),
            Err(LocalLogStorageGenerationCodecError::InvalidJson(_))
        ));
    }

    for (needle, replacement) in [
        (
            r#""sealedFrame":{"formatVersion":1,"maxPayloadBytes":"4096"}"#,
            r#""sealedFrame":{"formatVersion":1,"formatVersion":1,"maxPayloadBytes":"4096"}"#,
        ),
        (
            r#""sealedFrame":{"formatVersion":1,"maxPayloadBytes":"4096"}"#,
            r#""sealedFrame":{"formatVersion":1,"maxPayloadBytes":"4096","maxPayloadBytes":"4096"}"#,
        ),
        (
            r#""successorFrame":{"formatVersion":1,"maxPayloadBytes":"8192"}"#,
            r#""successorFrame":{"formatVersion":1,"formatVersion":1,"maxPayloadBytes":"8192"}"#,
        ),
        (
            r#""successorFrame":{"formatVersion":1,"maxPayloadBytes":"8192"}"#,
            r#""successorFrame":{"formatVersion":1,"maxPayloadBytes":"8192","maxPayloadBytes":"8192"}"#,
        ),
    ] {
        let duplicate = encoded.replacen(needle, replacement, 1);
        assert_ne!(duplicate, encoded);
        assert!(matches!(
            fixture.codec().decode_rotation(&duplicate, &fixture.prior),
            Err(LocalLogStorageGenerationCodecError::InvalidJson(_))
        ));
    }
    Ok(())
}

#[test]
fn every_identity_uses_checked_reconstruction() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let canonical: Value = serde_json::from_str(&encoded)?;
    let identities = [
        (
            "profileId",
            LocalLogStorageGenerationRecordErrorCode::InvalidProfileId,
            LocalLogStorageGenerationRecordLocation::ProfileId,
        ),
        (
            "scopeId",
            LocalLogStorageGenerationRecordErrorCode::InvalidScopeId,
            LocalLogStorageGenerationRecordLocation::ScopeId,
        ),
        (
            "transactionId",
            LocalLogStorageGenerationRecordErrorCode::InvalidTransactionId,
            LocalLogStorageGenerationRecordLocation::TransactionId,
        ),
        (
            "expectedHeadId",
            LocalLogStorageGenerationRecordErrorCode::InvalidExpectedHeadId,
            LocalLogStorageGenerationRecordLocation::ExpectedHeadId,
        ),
        (
            "committedHeadId",
            LocalLogStorageGenerationRecordErrorCode::InvalidCommittedHeadId,
            LocalLogStorageGenerationRecordLocation::CommittedHeadId,
        ),
        (
            "fenceId",
            LocalLogStorageGenerationRecordErrorCode::InvalidFenceId,
            LocalLogStorageGenerationRecordLocation::FenceId,
        ),
        (
            "sessionId",
            LocalLogStorageGenerationRecordErrorCode::InvalidSessionId,
            LocalLogStorageGenerationRecordLocation::SessionId,
        ),
        (
            "sealedLogId",
            LocalLogStorageGenerationRecordErrorCode::InvalidSealedLogId,
            LocalLogStorageGenerationRecordLocation::SealedLogId,
        ),
        (
            "successorLogId",
            LocalLogStorageGenerationRecordErrorCode::InvalidSuccessorLogId,
            LocalLogStorageGenerationRecordLocation::SuccessorLogId,
        ),
    ];
    for (field, code, location) in identities {
        let mut wrong_type = canonical.clone();
        wrong_type[field] = Value::from(7_u64);
        let wrong_type = serde_json::to_string(&wrong_type)?;
        assert!(matches!(
            fixture.codec().decode_rotation(&wrong_type, &fixture.prior),
            Err(LocalLogStorageGenerationCodecError::InvalidJson(_))
        ));

        let mut invalid = canonical.clone();
        invalid[field] = Value::String(String::from("-invalid"));
        let invalid = serde_json::to_string(&invalid)?;
        let Err(error) = fixture.codec().decode_rotation(&invalid, &fixture.prior) else {
            return Err(format!("invalid {field} was accepted").into());
        };
        let LocalLogStorageGenerationCodecError::InvalidRecord(record) = error else {
            return Err(format!("invalid {field} used the wrong error category").into());
        };
        assert_eq!(record.code(), code);
        assert_eq!(record.location(), location);
    }
    Ok(())
}

#[test]
fn every_fixed_width_number_uses_checked_reconstruction() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let canonical: Value = serde_json::from_str(&encoded)?;
    for invalid in ["", "01", "-1", "+1", "18446744073709551616"] {
        let mut value = canonical.clone();
        value["acceptedPrefixBytes"] = Value::String(String::from(invalid));
        let value = serde_json::to_string(&value)?;
        let Err(error) = fixture.codec().decode_rotation(&value, &fixture.prior) else {
            return Err(format!("invalid accepted prefix {invalid:?} was accepted").into());
        };
        let LocalLogStorageGenerationCodecError::InvalidRecord(record) = error else {
            return Err("invalid accepted prefix used the wrong error category".into());
        };
        assert_eq!(
            record.code(),
            LocalLogStorageGenerationRecordErrorCode::InvalidAcceptedPrefixBytes
        );
        assert_eq!(record.location(), LocalLogStorageGenerationRecordLocation::AcceptedPrefixBytes);
    }

    let mut numeric_decimal = canonical.clone();
    numeric_decimal["acceptedPrefixBytes"] = Value::from(1_u64);
    assert!(matches!(
        fixture.codec().decode_rotation(&serde_json::to_string(&numeric_decimal)?, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::InvalidJson(_))
    ));

    for (frame, version_code, version_location, maximum_code, maximum_location) in [
        (
            "sealedFrame",
            LocalLogStorageGenerationRecordErrorCode::InvalidSealedFrameFormatVersion,
            LocalLogStorageGenerationRecordLocation::SealedFrameFormatVersion,
            LocalLogStorageGenerationRecordErrorCode::InvalidSealedFrameMaxPayloadBytes,
            LocalLogStorageGenerationRecordLocation::SealedFrameMaxPayloadBytes,
        ),
        (
            "successorFrame",
            LocalLogStorageGenerationRecordErrorCode::InvalidSuccessorFrameFormatVersion,
            LocalLogStorageGenerationRecordLocation::SuccessorFrameFormatVersion,
            LocalLogStorageGenerationRecordErrorCode::InvalidSuccessorFrameMaxPayloadBytes,
            LocalLogStorageGenerationRecordLocation::SuccessorFrameMaxPayloadBytes,
        ),
    ] {
        let mut invalid_version = canonical.clone();
        invalid_version[frame]["formatVersion"] = Value::from(2_u64);
        let Err(error) = fixture
            .codec()
            .decode_rotation(&serde_json::to_string(&invalid_version)?, &fixture.prior)
        else {
            return Err(format!("unsupported {frame} version was accepted").into());
        };
        let LocalLogStorageGenerationCodecError::InvalidRecord(record) = error else {
            return Err(format!("unsupported {frame} version used the wrong category").into());
        };
        assert_eq!(record.code(), version_code);
        assert_eq!(record.location(), version_location);

        let mut invalid_maximum = canonical.clone();
        invalid_maximum[frame]["maxPayloadBytes"] = Value::String(String::from("01"));
        let Err(error) = fixture
            .codec()
            .decode_rotation(&serde_json::to_string(&invalid_maximum)?, &fixture.prior)
        else {
            return Err(format!("noncanonical {frame} maximum was accepted").into());
        };
        let LocalLogStorageGenerationCodecError::InvalidRecord(record) = error else {
            return Err(format!("noncanonical {frame} maximum used the wrong category").into());
        };
        assert_eq!(record.code(), maximum_code);
        assert_eq!(record.location(), maximum_location);
    }

    let mut maximum_values = canonical;
    maximum_values["acceptedPrefixBytes"] = Value::String(u64::MAX.to_string());
    maximum_values["successorFrame"]["maxPayloadBytes"] = Value::String(u64::MAX.to_string());
    assert!(matches!(
        fixture.codec().decode_rotation(&serde_json::to_string(&maximum_values)?, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::NonCanonicalManifestJson)
    ));
    Ok(())
}

#[test]
fn hostile_outer_and_nested_values_never_escape_through_public_diagnostics() -> TestResult {
    const OUTER_TYPE_SENTINEL: &str = "outer-type-secret-sentinel";
    const UNKNOWN_KEY_SENTINEL: &str = "unknown_key_secret_sentinel";
    const FORMAT_SENTINEL: &str = "attacker/format-secret-sentinel";
    const NESTED_SENTINEL: &str = "nested-checkpoint-secret-sentinel";

    let fixture = RotationFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let canonical: Value = serde_json::from_str(&encoded)?;
    let mut candidates = Vec::new();

    let mut wrong_type = canonical.clone();
    wrong_type["profileVersion"] = Value::String(String::from(OUTER_TYPE_SENTINEL));
    candidates.push(serde_json::to_string(&wrong_type)?);

    let mut unknown_key = canonical.clone();
    let Some(object) = unknown_key.as_object_mut() else {
        return Err("canonical manifest was not an object".into());
    };
    object.insert(String::from(UNKNOWN_KEY_SENTINEL), Value::Null);
    candidates.push(serde_json::to_string(&unknown_key)?);

    let mut hostile_format = canonical.clone();
    hostile_format["format"] = Value::String(String::from(FORMAT_SENTINEL));
    candidates.push(serde_json::to_string(&hostile_format)?);

    let mut hostile_nested = canonical;
    hostile_nested["checkpointJson"] = Value::String(format!(
        r#"{{"format":"breditor/local-log-checkpoint","formatVersion":"{NESTED_SENTINEL}"}}"#
    ));
    candidates.push(serde_json::to_string(&hostile_nested)?);

    let sentinels = [OUTER_TYPE_SENTINEL, UNKNOWN_KEY_SENTINEL, FORMAT_SENTINEL, NESTED_SENTINEL];
    for candidate in candidates {
        let Err(error) = fixture.codec().decode_rotation(&candidate, &fixture.prior) else {
            return Err("hostile manifest was accepted".into());
        };
        assert_diagnostic_chain_omits(&error, &sentinels);
    }
    Ok(())
}

fn assert_diagnostic_chain_omits(error: &LocalLogStorageGenerationCodecError, sentinels: &[&str]) {
    for diagnostic in [error.to_string(), format!("{error:?}")] {
        for sentinel in sentinels {
            assert!(!diagnostic.contains(sentinel));
        }
    }
    let mut source = error.source();
    while let Some(current) = source {
        for diagnostic in [current.to_string(), format!("{current:?}")] {
            for sentinel in sentinels {
                assert!(!diagnostic.contains(sentinel));
            }
        }
        source = current.source();
    }
}

#[test]
fn encode_and_decode_share_every_prior_continuity_rule() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (manifest, encoded) = fixture.encoded()?;
    let mut cases = Vec::new();

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.profile_id = LocalLogStorageProfileId::try_new("breditor/other-profile")?;
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::ProfileIdChanged,
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.profile_version = LocalLogStorageProfileVersion::try_new(2)?;
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::ProfileVersionChanged,
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.scope_id = LocalLogStorageScopeId::try_new("scope:other")?;
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::ScopeIdChanged,
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.session_id = LocalSessionId::try_new("session:other")?;
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::SessionIdChanged,
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.committed_head_id = LocalLogStorageHeadId::try_new("head:other-prior-commit")?;
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::ExpectedHeadMismatch,
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.successor_log_id = LocalLogId::try_new("log:other-prior-successor")?;
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::SealedLogMismatch,
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.successor_frame = super::LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(
        fixture.outcome.frame_limits().max_payload_bytes() + 1,
    ));
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::SealedFrameMismatch,
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.transaction_id = manifest.transaction_id().clone();
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::TransactionIdReused,
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.expected_head_id = manifest.committed_head_id().clone();
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::KnownHeadIdReused,
    ));

    let mut parts = copied_manifest_parts(&fixture.prior);
    parts.sealed_log_id = manifest.successor_log_id().clone();
    cases.push((
        LocalLogStorageGenerationManifest::from_parts(parts),
        LocalLogStorageGenerationContinuityError::KnownGenerationIdReused,
    ));

    for (prior, expected) in cases {
        assert!(matches!(
            fixture.codec().encode_rotation(&manifest, &prior),
            Err(LocalLogStorageGenerationCodecError::InvalidContinuity(actual))
                if actual == expected
        ));
        assert!(matches!(
            fixture.codec().decode_rotation(&encoded, &prior),
            Err(LocalLogStorageGenerationCodecError::InvalidContinuity(actual))
                if actual == expected
        ));
    }
    Ok(())
}

#[test]
fn every_candidate_topology_and_trusted_binding_field_fails_before_continuity() -> TestResult {
    let fixture = RotationFixture::new()?;
    let (manifest, _) = fixture.encoded()?;

    let mut equal_heads = copied_manifest_parts(&manifest);
    equal_heads.committed_head_id = equal_heads.expected_head_id.clone();
    let equal_heads = LocalLogStorageGenerationManifest::from_parts(equal_heads);
    assert!(matches!(
        fixture.codec().encode_rotation(&equal_heads, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::InvalidTopology(
            LocalLogStorageGenerationTopologyError::HeadNotAdvanced
        ))
    ));

    let mut equal_generations = copied_manifest_parts(&manifest);
    equal_generations.successor_log_id = equal_generations.sealed_log_id.clone();
    let equal_generations = LocalLogStorageGenerationManifest::from_parts(equal_generations);
    assert!(matches!(
        fixture.codec().encode_rotation(&equal_generations, &fixture.prior),
        Err(LocalLogStorageGenerationCodecError::InvalidTopology(
            LocalLogStorageGenerationTopologyError::GenerationNotAdvanced
        ))
    ));

    let mut candidates = Vec::new();
    let mut parts = copied_manifest_parts(&manifest);
    parts.profile_id = LocalLogStorageProfileId::try_new("breditor/other-profile")?;
    candidates.push((parts, LocalLogStorageGenerationBindingField::ProfileId));
    let mut parts = copied_manifest_parts(&manifest);
    parts.profile_version = LocalLogStorageProfileVersion::try_new(2)?;
    candidates.push((parts, LocalLogStorageGenerationBindingField::ProfileVersion));
    let mut parts = copied_manifest_parts(&manifest);
    parts.scope_id = LocalLogStorageScopeId::try_new("scope:other")?;
    candidates.push((parts, LocalLogStorageGenerationBindingField::ScopeId));
    let mut parts = copied_manifest_parts(&manifest);
    parts.expected_head_id = LocalLogStorageHeadId::try_new("head:other-expected")?;
    candidates.push((parts, LocalLogStorageGenerationBindingField::ExpectedHeadId));
    let mut parts = copied_manifest_parts(&manifest);
    parts.committed_head_id = LocalLogStorageHeadId::try_new("head:other-committed")?;
    candidates.push((parts, LocalLogStorageGenerationBindingField::CommittedHeadId));

    for (parts, field) in candidates {
        let candidate = LocalLogStorageGenerationManifest::from_parts(parts);
        assert!(matches!(
            fixture.codec().encode_rotation(&candidate, &fixture.prior),
            Err(LocalLogStorageGenerationCodecError::BindingMismatch { field: actual })
                if actual == field
        ));
    }
    Ok(())
}
