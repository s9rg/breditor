use std::error::Error;

use serde_json::Value;

use crate::{
    codec::{
        CodecErrorCode, DocumentJsonCodec, LocalLogCheckpointJsonCodec, LocalLogFrameLimits,
        LocalLogStorageGenerationLimits, LocalLogStorageRootBinding,
        LocalLogStorageRootBindingField, LocalLogStorageRootCodecError,
        LocalLogStorageRootJsonCodec, LocalLogStorageRootPreparationInputs,
        LocalLogStorageRootRecordErrorCode, LocalLogStorageRootRecordLocation,
        LocalLogStorageRootResourceLimit, LocalLogStorageRootSelection,
        LocalLogStorageRootSelectionParts, LocalLogStorageRootTopologyError,
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

struct RootFixture {
    context: EditorContext,
    binding: LocalLogStorageRootBinding,
    outcome: super::LocalLogTailCompactionOutcome,
    inputs: LocalLogStorageRootPreparationInputs,
}

impl RootFixture {
    fn new() -> TestResult<Self> {
        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(
                r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}]}}"#,
            )?;
        let state = EditorState::try_new(
            &context,
            LineageId::try_new("storage-root-tests")?,
            document,
            None,
            None,
        )?;
        let session_id = LocalSessionId::try_new("session:storage-root")?;
        let genesis_log_id = LocalLogId::try_new("log:storage-root:g0")?;
        let checkpoint_log_id = LocalLogId::try_new("log:storage-root:g1")?;
        let active_log_id = LocalLogId::try_new("log:storage-root:g2")?;
        let prior_anchor = LocalLogRecovery::new(session_id, genesis_log_id)
            .recover(EditorSession::new(state), Vec::new())?
            .try_into_checkpoint_anchor(checkpoint_log_id, LocalLogCompactionLimits::default())?;
        let old_frame_limits = LocalLogFrameLimits::new(4_096);
        let fresh_cursor =
            prior_anchor.begin_successor_tail(LocalLogRecoveryLimits::default(), old_frame_limits);
        let (owner, _, retained_frame_limits) = fresh_cursor.into_parts();
        let outcome =
            super::LocalLogTailCursor::from_trusted_parts(owner, 123, retained_frame_limits)
                .try_into_checkpoint_anchor(active_log_id)?;

        let binding = LocalLogStorageRootBinding::new(
            LocalLogStorageProfileId::try_new("breditor/test-storage")?,
            LocalLogStorageProfileVersion::try_new(1)?,
            LocalLogStorageScopeId::try_new("scope:storage-root")?,
            LocalLogStorageHeadId::try_new("head:storage-root:root")?,
        );
        let inputs = LocalLogStorageRootPreparationInputs::new(
            LocalLogStorageTransactionId::try_new("transaction:storage-root:root")?,
            LocalLogStorageFenceId::try_new("fence:storage-root:root")?,
            LocalLogFrameLimits::new(8_192),
        );
        Ok(Self { context, binding, outcome, inputs })
    }

    fn codec(&self) -> LocalLogStorageRootJsonCodec {
        LocalLogStorageRootJsonCodec::new(self.context.clone(), self.binding.clone())
    }

    fn prepared(&self) -> Result<LocalLogStorageRootSelection, LocalLogStorageRootCodecError> {
        self.codec().prepare_root(&self.outcome, &self.inputs)
    }

    fn encoded(
        &self,
    ) -> Result<(LocalLogStorageRootSelection, String), LocalLogStorageRootCodecError> {
        let selection = self.prepared()?;
        let encoded = self.codec().encode_root(&selection)?;
        Ok((selection, encoded))
    }
}

fn copied_selection_parts(
    value: &LocalLogStorageRootSelection,
) -> LocalLogStorageRootSelectionParts {
    LocalLogStorageRootSelectionParts {
        profile_id: value.profile_id().clone(),
        profile_version: value.profile_version(),
        scope_id: value.scope_id().clone(),
        transaction_id: value.transaction_id().clone(),
        committed_head_id: value.committed_head_id().clone(),
        fence_id: value.fence_id().clone(),
        session_id: value.session_id().clone(),
        checkpoint_log_id: value.checkpoint_log_id().clone(),
        active_log_id: value.active_log_id().clone(),
        active_frame: value.active_frame(),
        checkpoint_json: value.checkpoint_json().to_owned(),
    }
}

#[test]
fn prepare_encode_and_decode_form_one_exact_root_boundary() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, encoded) = fixture.encoded()?;

    assert_eq!(selection.profile_id(), fixture.binding.profile_id());
    assert_eq!(selection.profile_version(), fixture.binding.profile_version());
    assert_eq!(selection.scope_id(), fixture.binding.scope_id());
    assert_eq!(selection.committed_head_id(), fixture.binding.committed_head_id());
    assert_eq!(selection.transaction_id(), fixture.inputs.transaction_id());
    assert_eq!(selection.fence_id(), fixture.inputs.fence_id());
    assert_eq!(selection.session_id(), fixture.outcome.anchor().session_id());
    assert_eq!(selection.checkpoint_log_id(), fixture.outcome.anchor().checkpoint_log_id());
    assert_eq!(selection.active_log_id(), fixture.outcome.anchor().successor_log_id());
    assert_eq!(selection.active_frame().limits(), fixture.inputs.active_frame_limits());
    assert_ne!(selection.active_frame().limits(), fixture.outcome.frame_limits());
    assert_eq!(fixture.outcome.accepted_prefix_bytes(), 123);
    assert!(!encoded.contains("expectedHeadId"));
    assert!(!encoded.contains("acceptedPrefixBytes"));
    assert!(!encoded.contains("sealedFrame"));

    let decoded = fixture.codec().decode_root(&encoded)?;
    assert_eq!(decoded, selection);
    assert_eq!(fixture.codec().encode_root(&decoded)?, encoded);
    Ok(())
}

#[test]
fn input_output_and_checkpoint_limits_are_independent_and_exact() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, encoded) = fixture.encoded()?;
    let checkpoint_bytes = selection.checkpoint_json_bytes();

    let decode_with_zero_output = fixture
        .codec()
        .with_limits(LocalLogStorageGenerationLimits::default().with_max_output_bytes(0));
    assert_eq!(decode_with_zero_output.decode_root(&encoded)?, selection);
    assert!(matches!(
        decode_with_zero_output.encode_root(&selection),
        Err(LocalLogStorageRootCodecError::OutputTooLarge { maximum: 0, .. })
    ));

    let prepare_with_zero_input = fixture
        .codec()
        .with_limits(LocalLogStorageGenerationLimits::default().with_max_input_bytes(0));
    let prepared = prepare_with_zero_input.prepare_root(&fixture.outcome, &fixture.inputs)?;
    assert_eq!(prepare_with_zero_input.encode_root(&prepared)?, encoded);

    let exact = fixture.codec().with_limits(
        LocalLogStorageGenerationLimits::default()
            .with_max_input_bytes(encoded.len())
            .with_max_output_bytes(encoded.len())
            .with_max_checkpoint_json_bytes(checkpoint_bytes),
    );
    assert_eq!(exact.decode_root(&encoded)?, selection);
    assert_eq!(exact.encode_root(&selection)?, encoded);

    assert!(matches!(
        fixture
            .codec()
            .with_limits(
                LocalLogStorageGenerationLimits::default().with_max_input_bytes(encoded.len() - 1)
            )
            .decode_root(&encoded),
        Err(LocalLogStorageRootCodecError::InputTooLarge { .. })
    ));
    let short_checkpoint = fixture.codec().with_limits(
        LocalLogStorageGenerationLimits::default()
            .with_max_checkpoint_json_bytes(checkpoint_bytes - 1),
    );
    assert!(matches!(
        short_checkpoint.decode_root(&encoded),
        Err(LocalLogStorageRootCodecError::ResourceLimit(
            LocalLogStorageRootResourceLimit::CheckpointJsonBytes { .. }
        ))
    ));
    assert!(matches!(
        short_checkpoint.prepare_root(&fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageRootCodecError::ResourceLimit(
            LocalLogStorageRootResourceLimit::CheckpointJsonBytes { .. }
        ))
    ));
    Ok(())
}

#[test]
fn outer_and_nested_canonicality_are_independently_strict() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, encoded) = fixture.encoded()?;

    for altered in [format!(" {encoded}"), format!("{encoded}\n")] {
        assert!(matches!(
            fixture.codec().decode_root(&altered),
            Err(LocalLogStorageRootCodecError::NonCanonicalRootJson)
        ));
    }
    let reordered = encoded.replacen(
        r#"{"format":"breditor/local-log-storage-root","formatVersion":1"#,
        r#"{"formatVersion":1,"format":"breditor/local-log-storage-root""#,
        1,
    );
    assert_ne!(reordered, encoded);
    let Err(reordered_error) = fixture.codec().decode_root(&reordered) else {
        return Err("reordered root was accepted".into());
    };
    assert!(
        matches!(reordered_error, LocalLogStorageRootCodecError::NonCanonicalRootJson),
        "unexpected reordered-root failure: {reordered_error:?}"
    );
    let escaped =
        encoded.replacen("breditor/local-log-checkpoint", r"\u0062reditor/local-log-checkpoint", 1);
    assert_ne!(escaped, encoded);
    assert!(matches!(
        fixture.codec().decode_root(&escaped),
        Err(LocalLogStorageRootCodecError::NonCanonicalRootJson)
    ));

    let mut value: Value = serde_json::from_str(&encoded)?;
    value["checkpointJson"] = Value::String(format!(" {}", selection.checkpoint_json()));
    assert!(matches!(
        fixture.codec().decode_root(&serde_json::to_string(&value)?),
        Err(LocalLogStorageRootCodecError::NonCanonicalCheckpointJson)
    ));
    value["checkpointJson"] = Value::String(String::from("not-json"));
    assert!(matches!(
        fixture.codec().decode_root(&serde_json::to_string(&value)?),
        Err(LocalLogStorageRootCodecError::InvalidCheckpoint(_))
    ));
    Ok(())
}

#[test]
fn every_outer_and_frame_member_is_required_unique_and_closed() -> TestResult {
    const OUTER_FIELDS: [&str; 13] = [
        "format",
        "formatVersion",
        "profileId",
        "profileVersion",
        "scopeId",
        "transactionId",
        "committedHeadId",
        "fenceId",
        "sessionId",
        "checkpointLogId",
        "activeLogId",
        "activeFrame",
        "checkpointJson",
    ];
    let fixture = RootFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let canonical: Value = serde_json::from_str(&encoded)?;

    for field in OUTER_FIELDS {
        let mut missing = canonical.clone();
        let removed = missing
            .as_object_mut()
            .and_then(|object| object.remove(field))
            .ok_or("golden root lacked one required field")?;
        assert!(matches!(
            fixture.codec().decode_root(&serde_json::to_string(&missing)?),
            Err(LocalLogStorageRootCodecError::InvalidJson(_))
        ));

        let prefix = encoded.strip_suffix('}').ok_or("root lacked final object delimiter")?;
        let duplicate = format!(
            "{prefix},{}:{}}}",
            serde_json::to_string(field)?,
            serde_json::to_string(&removed)?
        );
        assert!(matches!(
            fixture.codec().decode_root(&duplicate),
            Err(LocalLogStorageRootCodecError::InvalidJson(_))
        ));
    }

    for field in ["formatVersion", "maxPayloadBytes"] {
        let mut missing = canonical.clone();
        missing["activeFrame"]
            .as_object_mut()
            .ok_or("active frame was not an object")?
            .remove(field);
        assert!(matches!(
            fixture.codec().decode_root(&serde_json::to_string(&missing)?),
            Err(LocalLogStorageRootCodecError::InvalidJson(_))
        ));
    }
    let mut unknown = canonical;
    unknown["activeFrame"]
        .as_object_mut()
        .ok_or("active frame was not an object")?
        .insert(String::from("unexpected"), Value::Bool(true));
    assert!(matches!(
        fixture.codec().decode_root(&serde_json::to_string(&unknown)?),
        Err(LocalLogStorageRootCodecError::InvalidJson(_))
    ));

    for replacement in [
        r#""activeFrame":{"formatVersion":1,"formatVersion":1,"maxPayloadBytes":"8192"}"#,
        r#""activeFrame":{"formatVersion":1,"maxPayloadBytes":"8192","maxPayloadBytes":"8192"}"#,
    ] {
        let duplicate = encoded.replacen(
            r#""activeFrame":{"formatVersion":1,"maxPayloadBytes":"8192"}"#,
            replacement,
            1,
        );
        assert_ne!(duplicate, encoded);
        assert!(matches!(
            fixture.codec().decode_root(&duplicate),
            Err(LocalLogStorageRootCodecError::InvalidJson(_))
        ));
    }
    Ok(())
}

#[test]
fn identities_frame_topology_and_binding_are_checked_before_checkpoint_work() -> TestResult {
    let fixture = RootFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let canonical: Value = serde_json::from_str(&encoded)?;
    let identities = [
        (
            "profileId",
            LocalLogStorageRootRecordErrorCode::InvalidProfileId,
            LocalLogStorageRootRecordLocation::ProfileId,
        ),
        (
            "scopeId",
            LocalLogStorageRootRecordErrorCode::InvalidScopeId,
            LocalLogStorageRootRecordLocation::ScopeId,
        ),
        (
            "transactionId",
            LocalLogStorageRootRecordErrorCode::InvalidTransactionId,
            LocalLogStorageRootRecordLocation::TransactionId,
        ),
        (
            "committedHeadId",
            LocalLogStorageRootRecordErrorCode::InvalidCommittedHeadId,
            LocalLogStorageRootRecordLocation::CommittedHeadId,
        ),
        (
            "fenceId",
            LocalLogStorageRootRecordErrorCode::InvalidFenceId,
            LocalLogStorageRootRecordLocation::FenceId,
        ),
        (
            "sessionId",
            LocalLogStorageRootRecordErrorCode::InvalidSessionId,
            LocalLogStorageRootRecordLocation::SessionId,
        ),
        (
            "checkpointLogId",
            LocalLogStorageRootRecordErrorCode::InvalidCheckpointLogId,
            LocalLogStorageRootRecordLocation::CheckpointLogId,
        ),
        (
            "activeLogId",
            LocalLogStorageRootRecordErrorCode::InvalidActiveLogId,
            LocalLogStorageRootRecordLocation::ActiveLogId,
        ),
    ];
    for (field, code, location) in identities {
        let mut invalid = canonical.clone();
        invalid[field] = Value::String(String::from("-invalid"));
        let Err(LocalLogStorageRootCodecError::InvalidRecord(error)) =
            fixture.codec().decode_root(&serde_json::to_string(&invalid)?)
        else {
            return Err(format!("invalid {field} used the wrong category").into());
        };
        assert_eq!(error.code(), code);
        assert_eq!(error.location(), location);
    }

    for invalid in ["", "01", "-1", "+1", "18446744073709551616"] {
        let mut value = canonical.clone();
        value["activeFrame"]["maxPayloadBytes"] = Value::String(String::from(invalid));
        let Err(LocalLogStorageRootCodecError::InvalidRecord(error)) =
            fixture.codec().decode_root(&serde_json::to_string(&value)?)
        else {
            return Err(format!("invalid frame maximum {invalid:?} used the wrong category").into());
        };
        assert_eq!(
            error.code(),
            LocalLogStorageRootRecordErrorCode::InvalidActiveFrameMaxPayloadBytes
        );
    }

    let mut equal_logs = canonical.clone();
    equal_logs["activeLogId"] = equal_logs["checkpointLogId"].clone();
    assert!(matches!(
        fixture.codec().decode_root(&serde_json::to_string(&equal_logs)?),
        Err(LocalLogStorageRootCodecError::InvalidTopology(
            LocalLogStorageRootTopologyError::GenerationNotAdvanced
        ))
    ));

    let mut wrong_binding = canonical;
    wrong_binding["committedHeadId"] = Value::String(String::from("head:other"));
    wrong_binding["checkpointJson"] = Value::String(String::from("hostile-checkpoint-sentinel"));
    assert!(matches!(
        fixture.codec().decode_root(&serde_json::to_string(&wrong_binding)?),
        Err(LocalLogStorageRootCodecError::BindingMismatch {
            field: LocalLogStorageRootBindingField::CommittedHeadId
        })
    ));
    Ok(())
}

#[test]
fn encode_rechecks_topology_and_every_trusted_binding_field() -> TestResult {
    let fixture = RootFixture::new()?;
    let selection = fixture.prepared()?;

    let mut equal = copied_selection_parts(&selection);
    equal.active_log_id = equal.checkpoint_log_id.clone();
    assert!(matches!(
        fixture.codec().encode_root(&LocalLogStorageRootSelection::from_parts(equal)),
        Err(LocalLogStorageRootCodecError::InvalidTopology(
            LocalLogStorageRootTopologyError::GenerationNotAdvanced
        ))
    ));

    let mut cases = Vec::new();
    let mut parts = copied_selection_parts(&selection);
    parts.profile_id = LocalLogStorageProfileId::try_new("breditor/other")?;
    cases.push((parts, LocalLogStorageRootBindingField::ProfileId));
    let mut parts = copied_selection_parts(&selection);
    parts.profile_version = LocalLogStorageProfileVersion::try_new(2)?;
    cases.push((parts, LocalLogStorageRootBindingField::ProfileVersion));
    let mut parts = copied_selection_parts(&selection);
    parts.scope_id = LocalLogStorageScopeId::try_new("scope:other")?;
    cases.push((parts, LocalLogStorageRootBindingField::ScopeId));
    let mut parts = copied_selection_parts(&selection);
    parts.committed_head_id = LocalLogStorageHeadId::try_new("head:other")?;
    cases.push((parts, LocalLogStorageRootBindingField::CommittedHeadId));
    for (parts, field) in cases {
        assert!(matches!(
            fixture.codec().encode_root(&LocalLogStorageRootSelection::from_parts(parts)),
            Err(LocalLogStorageRootCodecError::BindingMismatch { field: actual })
                if actual == field
        ));
    }
    Ok(())
}

#[test]
fn preparation_borrows_outcome_and_rejects_another_context() -> TestResult {
    let fixture = RootFixture::new()?;
    let first = fixture.codec().prepare_root(&fixture.outcome, &fixture.inputs)?;
    let second = fixture.codec().prepare_root(&fixture.outcome, &fixture.inputs)?;
    assert_eq!(first, second);
    assert_eq!(fixture.outcome.accepted_prefix_bytes(), 123);

    let wrong_context = fixture.context.clone().with_max_operations_per_transaction(
        fixture.context.max_operations_per_transaction().saturating_add(1),
    );
    let codec = LocalLogStorageRootJsonCodec::new(wrong_context, fixture.binding.clone());
    assert!(matches!(
        codec.prepare_root(&fixture.outcome, &fixture.inputs),
        Err(LocalLogStorageRootCodecError::ContextConfigurationMismatch)
    ));
    Ok(())
}

#[test]
fn complete_v1_wire_bytes_are_golden_including_every_json_escape_class() -> TestResult {
    let selection = LocalLogStorageRootSelection::from_parts(LocalLogStorageRootSelectionParts {
        profile_id: LocalLogStorageProfileId::try_new("breditor/golden")?,
        profile_version: LocalLogStorageProfileVersion::try_new(u32::MAX)?,
        scope_id: LocalLogStorageScopeId::try_new("scope:golden")?,
        transaction_id: LocalLogStorageTransactionId::try_new("transaction:golden")?,
        committed_head_id: LocalLogStorageHeadId::try_new("head:root")?,
        fence_id: LocalLogStorageFenceId::try_new("fence:golden")?,
        session_id: LocalSessionId::try_new("session:golden")?,
        checkpoint_log_id: LocalLogId::try_new("log:checkpoint")?,
        active_log_id: LocalLogId::try_new("log:active")?,
        active_frame: super::LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(
            u64::MAX,
        )),
        checkpoint_json: String::from(
            "quote\" slash/ backslash\\ controls:\u{0008}\u{000c}\n\r\t nul:\0 unicode:é😀\u{2028}",
        ),
    });
    let actual =
        serde_json::to_string(&super::local_log_storage_root_json::root_record(&selection))?;
    let expected =
        include_str!("fixtures/local_log_storage_root_v1_serde_json_1_0_151_golden.json")
            .trim_end_matches('\n');
    assert_eq!(actual, expected);
    Ok(())
}

#[test]
fn hostile_values_never_escape_through_public_diagnostics() -> TestResult {
    const OUTER_SENTINEL: &str = "outer-type-secret-sentinel";
    const UNKNOWN_SENTINEL: &str = "unknown_key_secret_sentinel";
    const FORMAT_SENTINEL: &str = "attacker/format-secret-sentinel";
    const NESTED_SENTINEL: &str = "nested-checkpoint-secret-sentinel";

    let fixture = RootFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let canonical: Value = serde_json::from_str(&encoded)?;
    let mut candidates = Vec::new();
    let mut wrong_type = canonical.clone();
    wrong_type["profileVersion"] = Value::String(String::from(OUTER_SENTINEL));
    candidates.push(serde_json::to_string(&wrong_type)?);
    let mut unknown = canonical.clone();
    unknown
        .as_object_mut()
        .ok_or("root was not an object")?
        .insert(String::from(UNKNOWN_SENTINEL), Value::Null);
    candidates.push(serde_json::to_string(&unknown)?);
    let mut format = canonical.clone();
    format["format"] = Value::String(String::from(FORMAT_SENTINEL));
    candidates.push(serde_json::to_string(&format)?);
    let mut nested = canonical;
    nested["checkpointJson"] = Value::String(format!(
        r#"{{"format":"breditor/local-log-checkpoint","formatVersion":"{NESTED_SENTINEL}"}}"#
    ));
    candidates.push(serde_json::to_string(&nested)?);

    let sentinels = [OUTER_SENTINEL, UNKNOWN_SENTINEL, FORMAT_SENTINEL, NESTED_SENTINEL];
    for candidate in candidates {
        let error =
            fixture.codec().decode_root(&candidate).err().ok_or("hostile root was accepted")?;
        assert_diagnostic_chain_omits(&error, &sentinels);
    }
    Ok(())
}

fn assert_diagnostic_chain_omits(error: &LocalLogStorageRootCodecError, sentinels: &[&str]) {
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
fn codec_error_codes_distinguish_root_shape_and_nested_checkpoint_failures() -> TestResult {
    let fixture = RootFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let mut value: Value = serde_json::from_str(&encoded)?;
    value["activeLogId"] = value["checkpointLogId"].clone();
    let topology = fixture
        .codec()
        .decode_root(&serde_json::to_string(&value)?)
        .err()
        .ok_or("equal generations were accepted")?;
    assert_eq!(topology.code(), CodecErrorCode::InvalidLocalLogStorageRoot);

    value = serde_json::from_str(&encoded)?;
    value["checkpointJson"] = Value::String(String::from("not-json"));
    let nested = fixture
        .codec()
        .decode_root(&serde_json::to_string(&value)?)
        .err()
        .ok_or("invalid checkpoint was accepted")?;
    assert_eq!(nested.code(), CodecErrorCode::InvalidJson);
    Ok(())
}

#[test]
fn nested_checkpoint_binding_matches_all_three_derived_identities() -> TestResult {
    let fixture = RootFixture::new()?;
    let (_, encoded) = fixture.encoded()?;
    let canonical: Value = serde_json::from_str(&encoded)?;

    for field in ["sessionId", "checkpointLogId", "activeLogId"] {
        let mut value = canonical.clone();
        value[field] = Value::String(format!("{field}:other"));
        let error = fixture
            .codec()
            .decode_root(&serde_json::to_string(&value)?)
            .err()
            .ok_or("mismatched root identity was accepted")?;
        if field == "activeLogId" || field == "checkpointLogId" {
            assert!(matches!(
                error,
                LocalLogStorageRootCodecError::InvalidCheckpoint(_)
                    | LocalLogStorageRootCodecError::InvalidTopology(_)
            ));
        } else {
            assert!(matches!(error, LocalLogStorageRootCodecError::InvalidCheckpoint(_)));
        }
    }

    let selection = fixture.prepared()?;
    let checkpoint_codec = LocalLogCheckpointJsonCodec::new(
        fixture.context,
        LocalLogCheckpointBinding::try_new(
            selection.session_id().clone(),
            selection.checkpoint_log_id().clone(),
            selection.active_log_id().clone(),
        )?,
    );
    let anchor = checkpoint_codec.decode(selection.checkpoint_json())?;
    assert_eq!(anchor.session_id(), selection.session_id());
    assert_eq!(anchor.checkpoint_log_id(), selection.checkpoint_log_id());
    assert_eq!(anchor.successor_log_id(), selection.active_log_id());
    Ok(())
}
