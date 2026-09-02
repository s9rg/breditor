use std::error::Error;

use serde_json::Value;

use crate::{
    codec::{
        CodecErrorCode, DocumentJsonCodec, LocalLogCheckpointJsonCodec, LocalLogFrameLimits,
        LocalLogStorageAttemptPreparationErrorCode, LocalLogStorageAttemptRequest,
        LocalLogStorageAttemptTerminalAttestation, LocalLogStorageAttemptTerminalAttestationKind,
        LocalLogStorageAttemptTerminalOutcome, LocalLogStorageAttemptTransitionError,
        LocalLogStorageGenerationLimits, LocalLogStorageRootBinding,
        LocalLogStorageRootBindingField, LocalLogStorageRootCodecError,
        LocalLogStorageRootJsonCodec, LocalLogStorageRootPreparationInputs,
        LocalLogStorageRootRecordErrorCode, LocalLogStorageRootRecordLocation,
        LocalLogStorageRootResourceLimit, LocalLogStorageRootSelection,
        LocalLogStorageRootSelectionParts, LocalLogStorageRootTopologyError,
        LocalLogStorageSelectedActiveGenerationBinding, LocalLogStorageSelectedBinding,
        LocalLogStorageSelectedCheckpointGenerationBinding,
        LocalLogStorageSelectedCheckpointGenerationState, LocalLogStorageSelectedRootErrorCode,
        LocalLogStorageSelectionKind, LocalLogStorageSelectionReceiptBinding,
    },
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryLimits, LocalLogStorageAttemptRequestId,
        LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId, LocalLogStorageHeadId,
        LocalLogStorageProfileId, LocalLogStorageProfileVersion, LocalLogStorageScopeId,
        LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId, LocalSessionId,
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
                r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[{"kind":"text","text":"ROOTATTEMPTPAYLOADSENTINEL","formats":[]}]}]}}"#,
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

#[test]
#[allow(clippy::too_many_lines)]
fn exact_root_attempt_is_closed_before_one_shot_request_egress() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let database_incarnation_id =
        LocalLogStorageDatabaseIncarnationId::try_new("database:root-attempt")?;
    let scope_incarnation_id =
        LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-attempt")?;
    let expected_candidate_binding = LocalLogStorageSelectedBinding::try_new(
        LocalLogStorageSelectionReceiptBinding::try_new(
            selection.profile_id().clone(),
            selection.profile_version(),
            database_incarnation_id.clone(),
            selection.scope_id().clone(),
            scope_incarnation_id.clone(),
            selection.transaction_id().clone(),
            None,
            selection.committed_head_id().clone(),
            LocalLogStorageSelectionKind::Root,
            selection.session_id().clone(),
        )?,
        None,
        LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
            selection.checkpoint_log_id().clone(),
            selection.session_id().clone(),
            selection.committed_head_id().clone(),
        ),
        LocalLogStorageSelectedActiveGenerationBinding::new(
            selection.active_log_id().clone(),
            selection.session_id().clone(),
            selection.active_frame(),
            selection.fence_id().clone(),
            selection.committed_head_id().clone(),
        ),
    )?;
    let prepared = fixture.codec().prepare_root_attempt(
        &database_incarnation_id,
        &scope_incarnation_id,
        &selection,
    )?;

    assert_eq!(prepared.selection_kind(), LocalLogStorageSelectionKind::Root);
    assert_eq!(prepared.candidate_binding(), &expected_candidate_binding);
    assert_eq!(prepared.candidate_json_bytes(), expected_json.len());
    assert_eq!(prepared.retained_json_bytes(), Some(expected_json.len()));
    assert_eq!(prepared.selected_current_json_bytes(), None);
    assert_eq!(prepared.selected_predecessor_json_bytes(), None);
    assert_eq!(prepared.selected_binding(), None);
    assert_eq!(prepared.candidate_receipt().database_incarnation_id(), &database_incarnation_id);
    assert_eq!(prepared.candidate_receipt().scope_incarnation_id(), &scope_incarnation_id);
    assert_eq!(prepared.candidate_receipt().transaction_id(), selection.transaction_id());
    assert_eq!(
        prepared.candidate_binding().checkpoint_generation().state(),
        LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly
    );
    assert_eq!(
        prepared.candidate_binding().active_generation().log_id(),
        selection.active_log_id()
    );
    let prepared_debug = format!("{prepared:?}");
    assert!(expected_json.contains("ROOTATTEMPTPAYLOADSENTINEL"));
    assert!(!prepared_debug.contains("ROOTATTEMPTPAYLOADSENTINEL"));
    assert!(!prepared_debug.contains(&expected_json));
    assert!(!prepared_debug.contains(selection.checkpoint_json()));

    let other_prepared = fixture.codec().prepare_root_attempt(
        &database_incarnation_id,
        &scope_incarnation_id,
        &selection,
    )?;
    let other_uncertain = other_prepared.begin_attempt();
    let other_attempt_id = other_uncertain.attempt_id().clone();

    let mut uncertain = prepared.begin_attempt();
    let first_attempt_id = uncertain.attempt_id().clone();
    assert_ne!(first_attempt_id, other_attempt_id);
    assert_eq!(uncertain.require_current_attempt_id(&first_attempt_id), Ok(()));
    assert_eq!(
        uncertain.require_current_attempt_id(&other_attempt_id),
        Err(LocalLogStorageAttemptTransitionError::AttemptIdMismatch)
    );
    assert!(!uncertain.request_issued());
    assert!(!format!("{uncertain:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));
    let expected_candidate_binding = uncertain.candidate_binding().clone();
    {
        let request = uncertain.adapter_request()?;
        assert_eq!(request.attempt_id(), &first_attempt_id);
        assert_eq!(request.selection_kind(), LocalLogStorageSelectionKind::Root);
        assert_eq!(request.candidate_json(), expected_json);
        assert_eq!(request.candidate_binding(), &expected_candidate_binding);
        assert!(!format!("{request:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));
        let LocalLogStorageAttemptRequest::Root(root) = request else {
            return Err("root plan yielded a rotation request".into());
        };
        assert_eq!(root.candidate_json(), expected_json);
        assert_eq!(root.candidate_binding(), &expected_candidate_binding);
        let request_debug = format!("{root:?}");
        assert!(!request_debug.contains("ROOTATTEMPTPAYLOADSENTINEL"));
        assert!(!request_debug.contains(&expected_json));
        assert!(!request_debug.contains(selection.checkpoint_json()));
    }
    assert!(uncertain.request_issued());
    assert!(matches!(
        uncertain.adapter_request(),
        Err(LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed)
    ));
    Ok(())
}

#[test]
fn exact_root_resubmission_preserves_plan_and_refreshes_attempt_identity() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let prepared = fixture.codec().prepare_root_attempt(
        &LocalLogStorageDatabaseIncarnationId::try_new("database:root-retry")?,
        &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-retry")?,
        &selection,
    )?;
    let expected_binding = prepared.candidate_binding().clone();
    let mut uncertain = prepared.begin_attempt();
    let prior_id = uncertain.attempt_id().clone();
    let candidate_pointer = {
        let first = uncertain.adapter_request()?;
        assert_eq!(first.candidate_json(), expected_json);
        first.candidate_json().as_ptr()
    };

    let mut retried = uncertain.begin_exact_resubmission();
    assert_ne!(retried.attempt_id(), &prior_id);
    assert_eq!(
        retried.require_current_attempt_id(&prior_id),
        Err(LocalLogStorageAttemptTransitionError::AttemptIdMismatch)
    );
    assert_eq!(retried.candidate_binding(), &expected_binding);
    assert!(!retried.request_issued());
    let retried_id = retried.attempt_id().clone();
    let retry = retried.adapter_request()?;
    assert_eq!(retry.attempt_id(), &retried_id);
    assert_eq!(retry.candidate_json(), expected_json);
    assert_eq!(retry.candidate_binding(), &expected_binding);
    assert_eq!(retry.candidate_json().as_ptr(), candidate_pointer);
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn root_terminal_attestations_require_the_exact_emitted_request() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let database_incarnation_id =
        LocalLogStorageDatabaseIncarnationId::try_new("database:root-terminal")?;
    let scope_incarnation_id =
        LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-terminal")?;

    let prepared = fixture.codec().prepare_root_attempt(
        &database_incarnation_id,
        &scope_incarnation_id,
        &selection,
    )?;
    let expected_binding = prepared.candidate_binding().clone();
    let uncertain = prepared.begin_attempt();
    let attempt_id = uncertain.attempt_id().clone();
    let other_prepared = fixture.codec().prepare_root_attempt(
        &database_incarnation_id,
        &scope_incarnation_id,
        &selection,
    )?;
    let mut other_uncertain = other_prepared.begin_attempt();
    let other_request_id = other_uncertain.adapter_request()?.request_id().clone();
    let cross_plan =
        LocalLogStorageAttemptTerminalAttestation::publication_completed(&other_request_id);
    let Err(failure) = uncertain.observe_terminal_attestation(cross_plan) else {
        return Err("cross-plan request correlation was accepted".into());
    };
    assert_eq!(failure.code(), super::LocalLogStorageAttemptTransitionErrorCode::AttemptIdMismatch);
    assert_eq!(failure.owner().attempt_id(), &attempt_id);
    assert!(!failure.owner().request_issued());
    assert_eq!(
        failure.attestation().kind(),
        LocalLogStorageAttemptTerminalAttestationKind::PublicationCompleted
    );
    assert!(!format!("{failure:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));
    assert!(!failure.to_string().contains("ROOTATTEMPTPAYLOADSENTINEL"));

    let (mut uncertain, rejected, error) = failure.into_parts();
    assert_eq!(error, LocalLogStorageAttemptTransitionError::AttemptIdMismatch);
    assert_eq!(rejected.attempt_id(), other_request_id.attempt_id());
    let request_id = {
        let request = uncertain.adapter_request()?;
        assert_eq!(request.candidate_json(), expected_json);
        request.request_id().clone()
    };
    let complete = LocalLogStorageAttemptTerminalAttestation::publication_completed(&request_id);
    let outcome = uncertain.observe_terminal_attestation(complete)?;
    assert!(!format!("{outcome:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));
    let LocalLogStorageAttemptTerminalOutcome::HostAttestedCommitted(committed) = outcome else {
        return Err("publication complete did not produce committed evidence".into());
    };
    assert_eq!(committed.attempt_id(), &attempt_id);
    assert_eq!(committed.candidate_binding(), &expected_binding);
    assert_eq!(committed.candidate_json_bytes(), expected_json.len());
    assert_eq!(committed.selected_binding(), None);
    assert!(!format!("{committed:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));
    assert!(!format!("{committed:?}").contains(&expected_json));
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn root_pre_egress_terminal_attestation_cannot_be_laundered_after_egress() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let prepared = fixture.codec().prepare_root_attempt(
        &LocalLogStorageDatabaseIncarnationId::try_new("database:root-egress-token")?,
        &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-egress-token")?,
        &selection,
    )?;
    let uncertain = prepared.begin_attempt();
    let attempt_id = uncertain.attempt_id().clone();

    // Crate-internal adversarial construction: public callers cannot create a
    // request token before `adapter_request` exposes the core-issued token.
    let synthetic_request_id = LocalLogStorageAttemptRequestId::new(&attempt_id);
    let premature =
        LocalLogStorageAttemptTerminalAttestation::publication_completed(&synthetic_request_id);
    let Err(failure) = uncertain.observe_terminal_attestation(premature) else {
        return Err("synthetic pre-egress request token was accepted".into());
    };
    assert_eq!(failure.code(), super::LocalLogStorageAttemptTransitionErrorCode::RequestNotIssued);
    assert_eq!(failure.owner().attempt_id(), &attempt_id);
    assert_eq!(failure.attestation().request_id(), Some(&synthetic_request_id));
    assert!(!format!("{failure:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));

    let (mut uncertain, premature, error) = failure.into_parts();
    assert_eq!(error, LocalLogStorageAttemptTransitionError::RequestNotIssued);
    let actual_request_id = {
        let request = uncertain.adapter_request()?;
        assert_eq!(request.candidate_json(), expected_json);
        request.request_id().clone()
    };
    assert_ne!(actual_request_id, synthetic_request_id);

    let Err(failure) = uncertain.observe_terminal_attestation(premature) else {
        return Err("replayed pre-egress attestation was laundered after egress".into());
    };
    assert_eq!(failure.code(), super::LocalLogStorageAttemptTransitionErrorCode::RequestIdMismatch);
    assert_eq!(failure.owner().attempt_id(), &attempt_id);
    assert_eq!(failure.attestation().request_id(), Some(&synthetic_request_id));

    let uncertain = failure.into_owner();
    let complete =
        LocalLogStorageAttemptTerminalAttestation::publication_completed(&actual_request_id);
    let LocalLogStorageAttemptTerminalOutcome::HostAttestedCommitted(committed) =
        uncertain.observe_terminal_attestation(complete)?
    else {
        return Err("exact emitted request token did not commit".into());
    };
    assert_eq!(committed.attempt_id(), &attempt_id);
    assert_eq!(committed.candidate_json_bytes(), expected_json.len());
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn root_abort_is_physical_only_and_retains_the_exact_plan() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let prepared = fixture.codec().prepare_root_attempt(
        &LocalLogStorageDatabaseIncarnationId::try_new("database:root-abort")?,
        &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-abort")?,
        &selection,
    )?;
    let expected_binding = prepared.candidate_binding().clone();
    let mut uncertain = prepared.begin_attempt();
    let attempt_id = uncertain.attempt_id().clone();
    let request_id = {
        let request = uncertain.adapter_request()?;
        assert_eq!(request.candidate_json(), expected_json);
        request.request_id().clone()
    };

    let aborted = LocalLogStorageAttemptTerminalAttestation::transaction_aborted(&request_id);
    let outcome = uncertain.observe_terminal_attestation(aborted)?;
    assert!(!format!("{outcome:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));
    let LocalLogStorageAttemptTerminalOutcome::AttemptAborted(aborted) = outcome else {
        return Err("transaction abort did not produce aborted observation".into());
    };
    assert_eq!(aborted.attempt_id(), &attempt_id);
    assert_eq!(aborted.candidate_binding(), &expected_binding);
    assert!(!format!("{aborted:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));

    assert_eq!(aborted.candidate_json_bytes(), expected_json.len());
    Ok(())
}

#[test]
fn root_not_attempted_before_egress_remains_noncommit_and_can_exact_resubmit() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let prepared = fixture.codec().prepare_root_attempt(
        &LocalLogStorageDatabaseIncarnationId::try_new("database:root-not-attempted")?,
        &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-not-attempted")?,
        &selection,
    )?;
    let expected_binding = prepared.candidate_binding().clone();
    let uncertain = prepared.begin_attempt();
    let attempt_id = uncertain.attempt_id().clone();
    let not_attempted = LocalLogStorageAttemptTerminalAttestation::not_attempted(&attempt_id);
    let outcome = uncertain.observe_terminal_attestation(not_attempted)?;
    assert!(!format!("{outcome:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));
    let LocalLogStorageAttemptTerminalOutcome::NotAttempted(not_attempted) = outcome else {
        return Err("not-attempted attestation produced the wrong state".into());
    };
    assert!(!not_attempted.request_issued());
    assert_eq!(not_attempted.candidate_binding(), &expected_binding);
    assert!(!format!("{not_attempted:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));

    let mut retried = not_attempted.begin_exact_resubmission();
    assert_ne!(retried.attempt_id(), &attempt_id);
    assert_eq!(retried.candidate_binding(), &expected_binding);
    assert_eq!(retried.adapter_request()?.candidate_json(), expected_json);
    Ok(())
}

#[test]
fn root_abort_resubmission_refreshes_id_and_rejects_stale_completion() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let prepared = fixture.codec().prepare_root_attempt(
        &LocalLogStorageDatabaseIncarnationId::try_new("database:root-abort-retry")?,
        &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-abort-retry")?,
        &selection,
    )?;
    let mut uncertain = prepared.begin_attempt();
    let prior_id = uncertain.attempt_id().clone();
    let (candidate_pointer, prior_request_id) = {
        let request = uncertain.adapter_request()?;
        (request.candidate_json().as_ptr(), request.request_id().clone())
    };
    let abort = LocalLogStorageAttemptTerminalAttestation::transaction_aborted(&prior_request_id);
    let LocalLogStorageAttemptTerminalOutcome::AttemptAborted(aborted) =
        uncertain.observe_terminal_attestation(abort)?
    else {
        return Err("abort produced the wrong terminal observation".into());
    };

    let retried = aborted.begin_exact_resubmission();
    let retried_id = retried.attempt_id().clone();
    assert_ne!(retried_id, prior_id);
    let stale = LocalLogStorageAttemptTerminalAttestation::publication_completed(&prior_request_id);
    let Err(failure) = retried.observe_terminal_attestation(stale) else {
        return Err("completion from the old physical attempt was accepted".into());
    };
    assert_eq!(failure.code(), super::LocalLogStorageAttemptTransitionErrorCode::AttemptIdMismatch);
    assert_eq!(failure.owner().attempt_id(), &retried_id);
    let mut retried = failure.into_owner();
    let request = retried.adapter_request()?;
    assert_eq!(request.candidate_json(), expected_json);
    assert_eq!(request.candidate_json().as_ptr(), candidate_pointer);
    Ok(())
}

#[test]
fn root_copied_dispatch_is_outside_not_attempted_id_correlation() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let prepared = fixture.codec().prepare_root_attempt(
        &LocalLogStorageDatabaseIncarnationId::try_new("database:root-copy")?,
        &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-copy")?,
        &selection,
    )?;
    let mut uncertain = prepared.begin_attempt();
    let attempt_id = uncertain.attempt_id().clone();
    let (prior_request_id, candidate_pointer) = {
        let request = uncertain.adapter_request()?;
        (request.request_id().clone(), request.candidate_json().as_ptr())
    };
    let not_attempted = LocalLogStorageAttemptTerminalAttestation::not_attempted(&attempt_id);
    let LocalLogStorageAttemptTerminalOutcome::NotAttempted(not_attempted) =
        uncertain.observe_terminal_attestation(not_attempted)?
    else {
        return Err("not-attempted attestation produced the wrong state".into());
    };
    assert!(not_attempted.request_issued());
    let retried = not_attempted.begin_exact_resubmission();
    let retried_id = retried.attempt_id().clone();
    let copied_dispatch_complete =
        LocalLogStorageAttemptTerminalAttestation::publication_completed(&prior_request_id);
    let Err(failure) = retried.observe_terminal_attestation(copied_dispatch_complete) else {
        return Err("old attempt ID incorrectly correlated a copied dispatch".into());
    };
    assert_eq!(failure.code(), super::LocalLogStorageAttemptTransitionErrorCode::AttemptIdMismatch);
    assert_eq!(failure.owner().attempt_id(), &retried_id);
    let mut retried = failure.into_owner();
    let request = retried.adapter_request()?;
    assert_eq!(request.candidate_json(), expected_json);
    assert_eq!(request.candidate_json().as_ptr(), candidate_pointer);
    Ok(())
}

#[test]
fn root_attempt_outlives_borrowed_selection_and_compaction_outcome() -> TestResult {
    let (prepared, expected_json) = {
        let fixture = RootFixture::new()?;
        let (selection, expected_json) = fixture.encoded()?;
        let prepared = fixture.codec().prepare_root_attempt(
            &LocalLogStorageDatabaseIncarnationId::try_new("database:root-owned-plan")?,
            &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-owned-plan")?,
            &selection,
        )?;
        (prepared, expected_json)
    };

    let mut uncertain = prepared.begin_attempt();
    assert_eq!(uncertain.adapter_request()?.candidate_json(), expected_json);
    Ok(())
}

#[test]
fn exact_resubmission_before_request_egress_refreshes_id_and_remains_one_shot() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let prepared = fixture.codec().prepare_root_attempt(
        &LocalLogStorageDatabaseIncarnationId::try_new("database:root-retry-before-egress")?,
        &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-retry-before-egress")?,
        &selection,
    )?;
    let uncertain = prepared.begin_attempt();
    let prior_id = uncertain.attempt_id().clone();
    assert!(!uncertain.request_issued());

    let mut retried = uncertain.begin_exact_resubmission();
    let retried_id = retried.attempt_id().clone();
    assert_ne!(retried_id, prior_id);
    assert_eq!(
        retried.require_current_attempt_id(&prior_id),
        Err(LocalLogStorageAttemptTransitionError::AttemptIdMismatch)
    );
    assert!(!retried.request_issued());
    assert_eq!(retried.adapter_request()?.candidate_json(), expected_json);
    assert!(retried.request_issued());
    assert!(matches!(
        retried.adapter_request(),
        Err(LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed)
    ));
    Ok(())
}

#[test]
fn root_attempt_incarnations_are_plan_identity_outside_candidate_json() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let first = fixture.codec().prepare_root_attempt(
        &LocalLogStorageDatabaseIncarnationId::try_new("database:first")?,
        &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:first")?,
        &selection,
    )?;
    let second = fixture.codec().prepare_root_attempt(
        &LocalLogStorageDatabaseIncarnationId::try_new("database:second")?,
        &LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:second")?,
        &selection,
    )?;

    assert_ne!(first.candidate_binding(), second.candidate_binding());
    let mut first = first.begin_attempt();
    let mut second = second.begin_attempt();
    assert_eq!(first.adapter_request()?.candidate_json(), expected_json);
    assert_eq!(second.adapter_request()?.candidate_json(), expected_json);
    assert_eq!(selection.transaction_id(), fixture.inputs.transaction_id());
    Ok(())
}

#[test]
fn root_attempt_preparation_failure_is_payload_free_and_keeps_borrowed_inputs_usable() -> TestResult
{
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let database_incarnation_id =
        LocalLogStorageDatabaseIncarnationId::try_new("database:root-failure")?;
    let scope_incarnation_id =
        LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-failure")?;
    let limited = fixture
        .codec()
        .with_limits(LocalLogStorageGenerationLimits::default().with_max_output_bytes(0));
    let error = limited
        .prepare_root_attempt(&database_incarnation_id, &scope_incarnation_id, &selection)
        .err()
        .ok_or("zero-output attempt preparation unexpectedly succeeded")?;

    assert_eq!(error.code(), LocalLogStorageAttemptPreparationErrorCode::InvalidCandidate);
    assert_eq!(error.codec_code(), Some(CodecErrorCode::OutputTooLarge));
    assert!(!format!("{error:?}").contains(&expected_json));
    assert!(expected_json.contains("ROOTATTEMPTPAYLOADSENTINEL"));
    assert!(!format!("{error:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));
    assert!(!error.to_string().contains("ROOTATTEMPTPAYLOADSENTINEL"));
    assert!(!error.to_string().contains(selection.checkpoint_json()));
    assert_eq!(database_incarnation_id.as_str(), "database:root-failure");
    assert_eq!(scope_incarnation_id.as_str(), "scope-incarnation:root-failure");
    assert_eq!(fixture.codec().encode_root(&selection)?, expected_json);
    Ok(())
}

#[test]
fn root_attempt_final_normalization_enforces_input_limit_without_consuming_inputs() -> TestResult {
    let fixture = RootFixture::new()?;
    let (selection, expected_json) = fixture.encoded()?;
    let database_incarnation_id =
        LocalLogStorageDatabaseIncarnationId::try_new("database:root-normalization-limit")?;
    let scope_incarnation_id =
        LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:root-normalization-limit")?;
    let limited = fixture.codec().with_limits(
        LocalLogStorageGenerationLimits::default()
            .with_max_input_bytes(expected_json.len() - 1)
            .with_max_output_bytes(expected_json.len()),
    );
    let error = limited
        .prepare_root_attempt(&database_incarnation_id, &scope_incarnation_id, &selection)
        .err()
        .ok_or("input-limited final root normalization unexpectedly succeeded")?;

    assert_eq!(error.code(), LocalLogStorageAttemptPreparationErrorCode::InvalidCandidateEnvelope);
    assert_eq!(error.selection_kind(), LocalLogStorageSelectionKind::Root);
    assert_eq!(error.envelope_code(), Some(LocalLogStorageSelectedRootErrorCode::InvalidSelection));
    assert_eq!(error.codec_code(), None);
    assert!(!format!("{error:?}").contains("ROOTATTEMPTPAYLOADSENTINEL"));
    assert!(!error.to_string().contains("ROOTATTEMPTPAYLOADSENTINEL"));
    assert_eq!(database_incarnation_id.as_str(), "database:root-normalization-limit");
    assert_eq!(scope_incarnation_id.as_str(), "scope-incarnation:root-normalization-limit");
    assert_eq!(fixture.codec().encode_root(&selection)?, expected_json);
    Ok(())
}
