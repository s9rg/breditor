use std::error::Error;

use crate::{
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogId, LocalLogRecovery,
        LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId, LocalLogStorageHeadId,
        LocalLogStorageProfileId, LocalLogStorageProfileVersion, LocalLogStorageScopeId,
        LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId, LocalSessionId,
    },
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};

use super::{
    CodecErrorCode, DocumentJsonCodec, LocalLogCheckpointJsonCodec, LocalLogFrameLimits,
    LocalLogStorageGenerationFrameV1, LocalLogStorageGenerationManifest,
    LocalLogStorageGenerationManifestParts, LocalLogStorageRootBinding,
    LocalLogStorageRootJsonCodec, LocalLogStorageRootSelection, LocalLogStorageRootSelectionParts,
    LocalLogStorageSelectedActiveGenerationBinding, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectedCheckpointGenerationBinding,
    LocalLogStorageSelectedCheckpointGenerationState, LocalLogStorageSelectedEnvelopeError,
    LocalLogStorageSelectedEnvelopeErrorCode, LocalLogStorageSelectedJsonCodec,
    LocalLogStorageSelectedRootError, LocalLogStorageSelectedRootGenerationField,
    LocalLogStorageSelectedRootReceiptField, LocalLogStorageSelectedRootValueRole,
    LocalLogStorageSelectionKind, LocalLogStorageSelectionReceiptBinding,
    local_log_storage_generation_json::manifest_record,
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const PROFILE: &str = "breditor/selected-tests";
const SCOPE: &str = "scope:selected-tests";
const DATABASE_INCARNATION: &str = "database:selected-tests";
const SCOPE_INCARNATION: &str = "scope-incarnation:selected-tests";
const SESSION: &str = "session:selected-tests";

fn frame(maximum: u64) -> LocalLogStorageGenerationFrameV1 {
    LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(maximum))
}

fn checkpoint_json(
    context: &EditorContext,
    session_id: &str,
    checkpoint_log_id: &str,
    active_log_id: &str,
) -> TestResult<String> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(
            r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}]}}"#,
        )?;
    let state = EditorState::try_new(
        context,
        LineageId::try_new("selected-normalization-tests")?,
        document,
        None,
        None,
    )?;
    let session_id = LocalSessionId::try_new(session_id)?;
    let checkpoint_log_id = LocalLogId::try_new(checkpoint_log_id)?;
    let active_log_id = LocalLogId::try_new(active_log_id)?;
    let anchor = LocalLogRecovery::new(session_id.clone(), checkpoint_log_id.clone())
        .recover(EditorSession::new(state), Vec::new())?
        .try_into_checkpoint_anchor(active_log_id.clone(), LocalLogCompactionLimits::default())?;
    Ok(LocalLogCheckpointJsonCodec::new(
        context.clone(),
        LocalLogCheckpointBinding::try_new(session_id, checkpoint_log_id, active_log_id)?,
    )
    .encode(&anchor)?)
}

#[allow(clippy::too_many_arguments)]
fn root_json(
    context: &EditorContext,
    transaction_id: &str,
    committed_head_id: &str,
    fence_id: &str,
    session_id: &str,
    checkpoint_log_id: &str,
    active_log_id: &str,
    active_frame: LocalLogStorageGenerationFrameV1,
) -> TestResult<String> {
    let selection = LocalLogStorageRootSelection::from_parts(LocalLogStorageRootSelectionParts {
        profile_id: LocalLogStorageProfileId::try_new(PROFILE)?,
        profile_version: LocalLogStorageProfileVersion::try_new(1)?,
        scope_id: LocalLogStorageScopeId::try_new(SCOPE)?,
        transaction_id: LocalLogStorageTransactionId::try_new(transaction_id)?,
        committed_head_id: LocalLogStorageHeadId::try_new(committed_head_id)?,
        fence_id: LocalLogStorageFenceId::try_new(fence_id)?,
        session_id: LocalSessionId::try_new(session_id)?,
        checkpoint_log_id: LocalLogId::try_new(checkpoint_log_id)?,
        active_log_id: LocalLogId::try_new(active_log_id)?,
        active_frame,
        checkpoint_json: checkpoint_json(context, session_id, checkpoint_log_id, active_log_id)?,
    });
    let binding = LocalLogStorageRootBinding::new(
        LocalLogStorageProfileId::try_new(PROFILE)?,
        LocalLogStorageProfileVersion::try_new(1)?,
        LocalLogStorageScopeId::try_new(SCOPE)?,
        LocalLogStorageHeadId::try_new(committed_head_id)?,
    );
    Ok(LocalLogStorageRootJsonCodec::new(context.clone(), binding).encode_root(&selection)?)
}

#[allow(clippy::too_many_arguments)]
fn rotation_json(
    context: &EditorContext,
    transaction_id: &str,
    expected_head_id: &str,
    committed_head_id: &str,
    fence_id: &str,
    session_id: &str,
    sealed_log_id: &str,
    successor_log_id: &str,
    sealed_frame: LocalLogStorageGenerationFrameV1,
    successor_frame: LocalLogStorageGenerationFrameV1,
) -> TestResult<String> {
    rotation_json_with_accepted_prefix(
        context,
        transaction_id,
        expected_head_id,
        committed_head_id,
        fence_id,
        session_id,
        sealed_log_id,
        successor_log_id,
        sealed_frame,
        successor_frame,
        0,
    )
}

#[allow(clippy::too_many_arguments)]
fn rotation_json_with_accepted_prefix(
    context: &EditorContext,
    transaction_id: &str,
    expected_head_id: &str,
    committed_head_id: &str,
    fence_id: &str,
    session_id: &str,
    sealed_log_id: &str,
    successor_log_id: &str,
    sealed_frame: LocalLogStorageGenerationFrameV1,
    successor_frame: LocalLogStorageGenerationFrameV1,
    accepted_prefix_bytes: u64,
) -> TestResult<String> {
    let manifest =
        LocalLogStorageGenerationManifest::from_parts(LocalLogStorageGenerationManifestParts {
            profile_id: LocalLogStorageProfileId::try_new(PROFILE)?,
            profile_version: LocalLogStorageProfileVersion::try_new(1)?,
            scope_id: LocalLogStorageScopeId::try_new(SCOPE)?,
            transaction_id: LocalLogStorageTransactionId::try_new(transaction_id)?,
            expected_head_id: LocalLogStorageHeadId::try_new(expected_head_id)?,
            committed_head_id: LocalLogStorageHeadId::try_new(committed_head_id)?,
            fence_id: LocalLogStorageFenceId::try_new(fence_id)?,
            session_id: LocalSessionId::try_new(session_id)?,
            sealed_log_id: LocalLogId::try_new(sealed_log_id)?,
            successor_log_id: LocalLogId::try_new(successor_log_id)?,
            accepted_prefix_bytes,
            sealed_frame,
            successor_frame,
            checkpoint_json: checkpoint_json(context, session_id, sealed_log_id, successor_log_id)?,
        });
    Ok(serde_json::to_string(&manifest_record(&manifest))?)
}

fn receipt(
    kind: LocalLogStorageSelectionKind,
    transaction_id: &str,
    expected_head_id: Option<&str>,
    committed_head_id: &str,
    session_id: &str,
) -> TestResult<LocalLogStorageSelectionReceiptBinding> {
    Ok(LocalLogStorageSelectionReceiptBinding::try_new(
        LocalLogStorageProfileId::try_new(PROFILE)?,
        LocalLogStorageProfileVersion::try_new(1)?,
        LocalLogStorageDatabaseIncarnationId::try_new(DATABASE_INCARNATION)?,
        LocalLogStorageScopeId::try_new(SCOPE)?,
        LocalLogStorageScopeIncarnationId::try_new(SCOPE_INCARNATION)?,
        LocalLogStorageTransactionId::try_new(transaction_id)?,
        expected_head_id.map(LocalLogStorageHeadId::try_new).transpose()?,
        LocalLogStorageHeadId::try_new(committed_head_id)?,
        kind,
        LocalSessionId::try_new(session_id)?,
    )?)
}

fn root_binding() -> TestResult<LocalLogStorageSelectedBinding> {
    Ok(LocalLogStorageSelectedBinding::try_new(
        receipt(LocalLogStorageSelectionKind::Root, "transaction:t0", None, "head:h0", SESSION)?,
        None,
        LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
            LocalLogId::try_new("log:g0")?,
            LocalSessionId::try_new(SESSION)?,
            LocalLogStorageHeadId::try_new("head:h0")?,
        ),
        LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new("log:g1")?,
            LocalSessionId::try_new(SESSION)?,
            frame(1_024),
            LocalLogStorageFenceId::try_new("fence:f0")?,
            LocalLogStorageHeadId::try_new("head:h0")?,
        ),
    )?)
}

#[allow(clippy::too_many_arguments)]
fn rotation_binding(
    predecessor_kind: LocalLogStorageSelectionKind,
    predecessor_transaction_id: &str,
    predecessor_expected_head_id: Option<&str>,
    predecessor_committed_head_id: &str,
    current_transaction_id: &str,
    current_committed_head_id: &str,
    checkpoint_log_id: &str,
    checkpoint_frame: LocalLogStorageGenerationFrameV1,
    checkpoint_fence_id: &str,
    active_log_id: &str,
    active_frame: LocalLogStorageGenerationFrameV1,
    active_fence_id: &str,
    checkpoint_state: LocalLogStorageSelectedCheckpointGenerationState,
) -> TestResult<LocalLogStorageSelectedBinding> {
    let checkpoint = match checkpoint_state {
        LocalLogStorageSelectedCheckpointGenerationState::Retired => {
            LocalLogStorageSelectedCheckpointGenerationBinding::retired(
                LocalLogId::try_new(checkpoint_log_id)?,
                LocalSessionId::try_new(SESSION)?,
                checkpoint_frame,
                LocalLogStorageFenceId::try_new(checkpoint_fence_id)?,
                LocalLogStorageHeadId::try_new(predecessor_committed_head_id)?,
                LocalLogStorageHeadId::try_new(current_committed_head_id)?,
            )
        }
        LocalLogStorageSelectedCheckpointGenerationState::Reclaimed => {
            LocalLogStorageSelectedCheckpointGenerationBinding::reclaimed(
                LocalLogId::try_new(checkpoint_log_id)?,
                LocalSessionId::try_new(SESSION)?,
                checkpoint_frame,
                LocalLogStorageFenceId::try_new(checkpoint_fence_id)?,
                LocalLogStorageHeadId::try_new(predecessor_committed_head_id)?,
                LocalLogStorageHeadId::try_new(current_committed_head_id)?,
            )
        }
        LocalLogStorageSelectedCheckpointGenerationState::CheckpointOnly => {
            return Err("rotation helper requires a retired or reclaimed checkpoint".into());
        }
    };
    Ok(LocalLogStorageSelectedBinding::try_new(
        receipt(
            LocalLogStorageSelectionKind::Rotation,
            current_transaction_id,
            Some(predecessor_committed_head_id),
            current_committed_head_id,
            SESSION,
        )?,
        Some(receipt(
            predecessor_kind,
            predecessor_transaction_id,
            predecessor_expected_head_id,
            predecessor_committed_head_id,
            SESSION,
        )?),
        checkpoint,
        LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new(active_log_id)?,
            LocalSessionId::try_new(SESSION)?,
            active_frame,
            LocalLogStorageFenceId::try_new(active_fence_id)?,
            LocalLogStorageHeadId::try_new(current_committed_head_id)?,
        ),
    )?)
}

#[test]
fn normalizes_a_root_to_the_private_selected_summary() -> TestResult {
    let context = EditorContext::default();
    let json = root_json(
        &context,
        "transaction:t0",
        "head:h0",
        "fence:f0",
        SESSION,
        "log:g0",
        "log:g1",
        frame(1_024),
    )?;
    let binding = root_binding()?;
    let expected_receipt = binding.current_receipt().clone();
    let selected = LocalLogStorageSelectedJsonCodec::new(context, binding).normalize_root(&json)?;

    assert_eq!(selected.selection_kind(), LocalLogStorageSelectionKind::Root);
    assert_eq!(selected.previous_head_id(), None);
    assert_eq!(selected.current_receipt(), &expected_receipt);
    assert_eq!(selected.predecessor_receipt(), None);
    assert_eq!(selected.database_incarnation_id().as_str(), DATABASE_INCARNATION);
    assert_eq!(selected.scope_incarnation_id().as_str(), SCOPE_INCARNATION);
    assert_eq!(selected.checkpoint_log_id().as_str(), "log:g0");
    assert_eq!(selected.active_log_id().as_str(), "log:g1");
    assert_eq!(selected.activation_fence_id().as_str(), "fence:f0");
    assert!(selected.checkpoint_json().contains("breditor/local-log-checkpoint"));
    assert_eq!(selected.current_selection_json(), json);
    assert_eq!(selected.current_selection_json_bytes(), json.len());
    assert_eq!(selected.predecessor_selection_json(), None);
    assert_eq!(selected.predecessor_selection_json_bytes(), None);
    selected.validate_exact_selection_envelope(&json, None)?;
    let unexpected_predecessor = selected
        .validate_exact_selection_envelope(&json, Some(&json))
        .err()
        .ok_or("an exact root envelope accepted a predecessor")?;
    assert_eq!(unexpected_predecessor, LocalLogStorageSelectedEnvelopeError::UnexpectedPredecessor);
    assert_eq!(
        unexpected_predecessor.code(),
        LocalLogStorageSelectedEnvelopeErrorCode::UnexpectedPredecessor
    );
    assert_eq!(
        LocalLogStorageSelectedEnvelopeErrorCode::UnexpectedPredecessor.as_str(),
        "local_log_storage_selected_envelope.unexpected_predecessor"
    );
    let substituted = format!(" {json}attacker-envelope-sentinel");
    let substitution_error = selected
        .validate_exact_selection_envelope(&substituted, None)
        .err()
        .ok_or("a byte-different exact root envelope was accepted")?;
    assert_eq!(
        substitution_error,
        LocalLogStorageSelectedEnvelopeError::SelectionMismatch {
            role: LocalLogStorageSelectedRootValueRole::Current,
        }
    );
    assert_payload_free(&substitution_error, "attacker-envelope-sentinel");
    let debug = format!("{selected:?}");
    assert!(!debug.contains(&json));
    assert!(!debug.contains(selected.checkpoint_json()));
    assert!(!debug.contains("checkpoint_anchor"));
    assert!(debug.contains(&format!("current_selection_json_bytes: {}", json.len())));
    Ok(())
}

#[test]
fn normalizes_root_predecessor_rotations_for_retired_and_reclaimed() -> TestResult {
    let context = EditorContext::default();
    let predecessor = root_json(
        &context,
        "transaction:t0",
        "head:h0",
        "fence:f0",
        SESSION,
        "log:g0",
        "log:g1",
        frame(1_024),
    )?;
    let current = rotation_json(
        &context,
        "transaction:t1",
        "head:h0",
        "head:h1",
        "fence:f1",
        SESSION,
        "log:g1",
        "log:g2",
        frame(1_024),
        frame(2_048),
    )?;

    for state in [
        LocalLogStorageSelectedCheckpointGenerationState::Retired,
        LocalLogStorageSelectedCheckpointGenerationState::Reclaimed,
    ] {
        let binding = rotation_binding(
            LocalLogStorageSelectionKind::Root,
            "transaction:t0",
            None,
            "head:h0",
            "transaction:t1",
            "head:h1",
            "log:g1",
            frame(1_024),
            "fence:f0",
            "log:g2",
            frame(2_048),
            "fence:f1",
            state,
        )?;
        let expected_current_receipt = binding.current_receipt().clone();
        let expected_predecessor_receipt =
            binding.predecessor_receipt().cloned().ok_or("rotation binding omitted predecessor")?;
        let selected = LocalLogStorageSelectedJsonCodec::new(context.clone(), binding)
            .normalize_rotation(&current, &predecessor)?;
        assert_eq!(selected.previous_head_id().map(LocalLogStorageHeadId::as_str), Some("head:h0"));
        assert_eq!(selected.selected_head_id().as_str(), "head:h1");
        assert_eq!(selected.checkpoint_log_id().as_str(), "log:g1");
        assert_eq!(selected.active_log_id().as_str(), "log:g2");
        assert_eq!(selected.current_receipt(), &expected_current_receipt);
        assert_eq!(selected.predecessor_receipt(), Some(&expected_predecessor_receipt));
        assert_eq!(selected.current_selection_json(), current);
        assert_eq!(selected.predecessor_selection_json(), Some(predecessor.as_str()));
        assert_eq!(selected.current_selection_json_bytes(), current.len());
        assert_eq!(selected.predecessor_selection_json_bytes(), Some(predecessor.len()));
        selected.validate_exact_selection_envelope(&current, Some(&predecessor))?;
        let mismatched_current = format!("{current}shape-precedence-sentinel");
        let missing_predecessor = selected
            .validate_exact_selection_envelope(&mismatched_current, None)
            .err()
            .ok_or("a rotation envelope accepted a missing predecessor")?;
        assert_eq!(missing_predecessor, LocalLogStorageSelectedEnvelopeError::MissingPredecessor);
        assert_eq!(
            missing_predecessor.code(),
            LocalLogStorageSelectedEnvelopeErrorCode::MissingPredecessor
        );
        assert_eq!(
            LocalLogStorageSelectedEnvelopeErrorCode::MissingPredecessor.as_str(),
            "local_log_storage_selected_envelope.missing_predecessor"
        );
        assert_payload_free(&missing_predecessor, "shape-precedence-sentinel");
        let debug = format!("{selected:?}");
        assert!(!debug.contains(&current));
        assert!(!debug.contains(&predecessor));
    }
    Ok(())
}

#[test]
fn normalizes_a_rotation_predecessor_without_older_json() -> TestResult {
    let context = EditorContext::default();
    let predecessor = rotation_json(
        &context,
        "transaction:t1",
        "head:h0",
        "head:h1",
        "fence:f1",
        SESSION,
        "log:g1",
        "log:g2",
        frame(1_024),
        frame(2_048),
    )?;
    let current = rotation_json(
        &context,
        "transaction:t2",
        "head:h1",
        "head:h2",
        "fence:f2",
        SESSION,
        "log:g2",
        "log:g3",
        frame(2_048),
        frame(4_096),
    )?;
    let binding = rotation_binding(
        LocalLogStorageSelectionKind::Rotation,
        "transaction:t1",
        Some("head:h0"),
        "head:h1",
        "transaction:t2",
        "head:h2",
        "log:g2",
        frame(2_048),
        "fence:f1",
        "log:g3",
        frame(4_096),
        "fence:f2",
        LocalLogStorageSelectedCheckpointGenerationState::Retired,
    )?;

    let selected = LocalLogStorageSelectedJsonCodec::new(context, binding)
        .normalize_rotation(&current, &predecessor)?;
    assert_eq!(selected.transaction_id().as_str(), "transaction:t2");
    assert_eq!(selected.previous_head_id().map(LocalLogStorageHeadId::as_str), Some("head:h1"));
    assert_eq!(selected.active_frame().limits().max_payload_bytes(), 4_096);
    let predecessor_receipt =
        selected.predecessor_receipt().ok_or("selected rotation omitted predecessor receipt")?;
    assert_eq!(predecessor_receipt.selection_kind(), LocalLogStorageSelectionKind::Rotation);
    assert_eq!(predecessor_receipt.transaction_id().as_str(), "transaction:t1");
    assert_eq!(
        predecessor_receipt.expected_head_id().map(LocalLogStorageHeadId::as_str),
        Some("head:h0")
    );
    assert_eq!(predecessor_receipt.committed_head_id().as_str(), "head:h1");
    assert_eq!(selected.current_selection_json(), current);
    assert_eq!(selected.predecessor_selection_json(), Some(predecessor.as_str()));
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn retains_byte_distinct_rotations_that_share_the_old_normalized_summary() -> TestResult {
    let context = EditorContext::default();
    let current_zero = rotation_json_with_accepted_prefix(
        &context,
        "transaction:t2",
        "head:h1",
        "head:h2",
        "fence:f2",
        SESSION,
        "log:g2",
        "log:g3",
        frame(2_048),
        frame(4_096),
        0,
    )?;
    let current_one = rotation_json_with_accepted_prefix(
        &context,
        "transaction:t2",
        "head:h1",
        "head:h2",
        "fence:f2",
        SESSION,
        "log:g2",
        "log:g3",
        frame(2_048),
        frame(4_096),
        1,
    )?;
    let predecessor_zero = rotation_json_with_accepted_prefix(
        &context,
        "transaction:t1",
        "head:h0",
        "head:h1",
        "fence:f1",
        SESSION,
        "log:g1",
        "log:g2",
        frame(1_024),
        frame(2_048),
        0,
    )?;
    let predecessor_one = rotation_json_with_accepted_prefix(
        &context,
        "transaction:t1",
        "head:h0",
        "head:h1",
        "fence:f1",
        SESSION,
        "log:g1",
        "log:g2",
        frame(1_024),
        frame(2_048),
        1,
    )?;
    let binding = rotation_binding(
        LocalLogStorageSelectionKind::Rotation,
        "transaction:t1",
        Some("head:h0"),
        "head:h1",
        "transaction:t2",
        "head:h2",
        "log:g2",
        frame(2_048),
        "fence:f1",
        "log:g3",
        frame(4_096),
        "fence:f2",
        LocalLogStorageSelectedCheckpointGenerationState::Retired,
    )?;

    let selected_zero = LocalLogStorageSelectedJsonCodec::new(context.clone(), binding.clone())
        .normalize_rotation(&current_zero, &predecessor_zero)?;
    let selected_current_variant =
        LocalLogStorageSelectedJsonCodec::new(context.clone(), binding.clone())
            .normalize_rotation(&current_one, &predecessor_zero)?;
    let selected_predecessor_variant = LocalLogStorageSelectedJsonCodec::new(context, binding)
        .normalize_rotation(&current_zero, &predecessor_one)?;

    for variant in [&selected_current_variant, &selected_predecessor_variant] {
        assert_eq!(variant.current_receipt(), selected_zero.current_receipt());
        assert_eq!(variant.predecessor_receipt(), selected_zero.predecessor_receipt());
        assert_eq!(variant.selected_head_id(), selected_zero.selected_head_id());
        assert_eq!(variant.previous_head_id(), selected_zero.previous_head_id());
        assert_eq!(variant.activation_fence_id(), selected_zero.activation_fence_id());
        assert_eq!(variant.checkpoint_log_id(), selected_zero.checkpoint_log_id());
        assert_eq!(variant.active_log_id(), selected_zero.active_log_id());
        assert_eq!(variant.active_frame(), selected_zero.active_frame());
        assert_eq!(variant.checkpoint_json(), selected_zero.checkpoint_json());
    }

    assert_ne!(
        selected_zero.current_selection_json(),
        selected_current_variant.current_selection_json()
    );
    assert_eq!(
        selected_zero.predecessor_selection_json(),
        selected_current_variant.predecessor_selection_json()
    );
    assert_eq!(
        selected_zero.current_selection_json(),
        selected_predecessor_variant.current_selection_json()
    );
    assert_ne!(
        selected_zero.predecessor_selection_json(),
        selected_predecessor_variant.predecessor_selection_json()
    );
    assert_eq!(
        selected_zero.validate_exact_selection_envelope(&current_one, Some(&predecessor_zero)),
        Err(LocalLogStorageSelectedEnvelopeError::SelectionMismatch {
            role: LocalLogStorageSelectedRootValueRole::Current,
        })
    );
    let substituted_predecessor =
        format!("{predecessor_one}attacker-predecessor-envelope-sentinel");
    let predecessor_error = selected_zero
        .validate_exact_selection_envelope(&current_zero, Some(&substituted_predecessor))
        .err()
        .ok_or("a byte-different predecessor envelope was accepted")?;
    assert_eq!(
        predecessor_error,
        LocalLogStorageSelectedEnvelopeError::SelectionMismatch {
            role: LocalLogStorageSelectedRootValueRole::Predecessor,
        }
    );
    assert_payload_free(&predecessor_error, "attacker-predecessor-envelope-sentinel");
    assert_eq!(
        LocalLogStorageSelectedEnvelopeError::SelectionMismatch {
            role: LocalLogStorageSelectedRootValueRole::Current,
        }
        .code(),
        LocalLogStorageSelectedEnvelopeErrorCode::SelectionMismatch
    );
    assert_eq!(
        LocalLogStorageSelectedEnvelopeErrorCode::SelectionMismatch.as_str(),
        "local_log_storage_selected_envelope.selection_mismatch"
    );
    assert_eq!(
        LocalLogStorageSelectedEnvelopeError::RuntimeInvariant.code(),
        LocalLogStorageSelectedEnvelopeErrorCode::RuntimeInvariant
    );
    assert_eq!(
        LocalLogStorageSelectedEnvelopeErrorCode::RuntimeInvariant.as_str(),
        "local_log_storage_selected_envelope.runtime_invariant"
    );
    Ok(())
}

#[test]
fn trusted_kind_routes_predecessor_and_codec_errors_are_collapsed() -> TestResult {
    let context = EditorContext::default();
    let current = rotation_json(
        &context,
        "transaction:t1",
        "head:h0",
        "head:h1",
        "fence:f1",
        SESSION,
        "log:g1",
        "log:g2",
        frame(1_024),
        frame(2_048),
    )?;
    let predecessor_with_wrong_kind = rotation_json(
        &context,
        "transaction:t0",
        "head:older",
        "head:h0",
        "fence:f0",
        SESSION,
        "log:g0",
        "log:g1",
        frame(512),
        frame(1_024),
    )?;
    let binding = rotation_binding(
        LocalLogStorageSelectionKind::Root,
        "transaction:t0",
        None,
        "head:h0",
        "transaction:t1",
        "head:h1",
        "log:g1",
        frame(1_024),
        "fence:f0",
        "log:g2",
        frame(2_048),
        "fence:f1",
        LocalLogStorageSelectedCheckpointGenerationState::Retired,
    )?;
    assert_eq!(
        LocalLogStorageSelectedJsonCodec::new(context.clone(), binding)
            .normalize_rotation(&current, &predecessor_with_wrong_kind)
            .err(),
        Some(LocalLogStorageSelectedRootError::InvalidSelection {
            role: LocalLogStorageSelectedRootValueRole::Predecessor,
            selection_kind: LocalLogStorageSelectionKind::Root,
            code: CodecErrorCode::UnsupportedFormat,
        })
    );

    let noncanonical = format!(
        " {}",
        root_json(
            &context,
            "transaction:t0",
            "head:h0",
            "fence:f0",
            SESSION,
            "log:g0",
            "log:g1",
            frame(1_024),
        )?
    );
    assert_eq!(
        LocalLogStorageSelectedJsonCodec::new(context, root_binding()?)
            .normalize_root(&noncanonical)
            .err(),
        Some(LocalLogStorageSelectedRootError::InvalidSelection {
            role: LocalLogStorageSelectedRootValueRole::Current,
            selection_kind: LocalLogStorageSelectionKind::Root,
            code: CodecErrorCode::InvalidLocalLogStorageRoot,
        })
    );
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn rejects_receipt_cross_link_and_known_identity_reuse() -> TestResult {
    let context = EditorContext::default();
    let predecessor = rotation_json(
        &context,
        "transaction:t1",
        "head:h0",
        "head:h1",
        "fence:f1",
        SESSION,
        "log:g1",
        "log:g2",
        frame(1_024),
        frame(2_048),
    )?;

    let wrong_transaction = rotation_json(
        &context,
        "transaction:candidate-mismatch",
        "head:h1",
        "head:h2",
        "fence:f2",
        SESSION,
        "log:g2",
        "log:g3",
        frame(2_048),
        frame(4_096),
    )?;
    let ordinary_binding = || {
        rotation_binding(
            LocalLogStorageSelectionKind::Rotation,
            "transaction:t1",
            Some("head:h0"),
            "head:h1",
            "transaction:t2",
            "head:h2",
            "log:g2",
            frame(2_048),
            "fence:f1",
            "log:g3",
            frame(4_096),
            "fence:f2",
            LocalLogStorageSelectedCheckpointGenerationState::Retired,
        )
    };
    assert_eq!(
        LocalLogStorageSelectedJsonCodec::new(context.clone(), ordinary_binding()?)
            .normalize_rotation(&wrong_transaction, &predecessor)
            .err(),
        Some(LocalLogStorageSelectedRootError::ReceiptMismatch {
            role: LocalLogStorageSelectedRootValueRole::Current,
            field: LocalLogStorageSelectedRootReceiptField::TransactionId,
        })
    );

    let reused_generation = rotation_json(
        &context,
        "transaction:t2",
        "head:h1",
        "head:h2",
        "fence:f2",
        SESSION,
        "log:g2",
        "log:g1",
        frame(2_048),
        frame(4_096),
    )?;
    let generation_reuse_binding = rotation_binding(
        LocalLogStorageSelectionKind::Rotation,
        "transaction:t1",
        Some("head:h0"),
        "head:h1",
        "transaction:t2",
        "head:h2",
        "log:g2",
        frame(2_048),
        "fence:f1",
        "log:g1",
        frame(4_096),
        "fence:f2",
        LocalLogStorageSelectedCheckpointGenerationState::Retired,
    )?;
    assert_eq!(
        LocalLogStorageSelectedJsonCodec::new(context.clone(), generation_reuse_binding)
            .normalize_rotation(&reused_generation, &predecessor)
            .err(),
        Some(LocalLogStorageSelectedRootError::KnownGenerationIdReused)
    );

    Ok(())
}

#[test]
fn cross_link_categories_and_error_chains_are_payload_free() -> TestResult {
    const SENTINEL: &str = "attacker-selected-json-sentinel";
    let context = EditorContext::default();
    let json = root_json(
        &context,
        "transaction:t0",
        "head:h0",
        "fence:f0",
        SESSION,
        "log:g0",
        "log:g1",
        frame(1_024),
    )?;
    let mismatched_binding = LocalLogStorageSelectedBinding::try_new(
        receipt(LocalLogStorageSelectionKind::Root, "transaction:t0", None, "head:h0", SESSION)?,
        None,
        LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
            LocalLogId::try_new("log:g9")?,
            LocalSessionId::try_new(SESSION)?,
            LocalLogStorageHeadId::try_new("head:h0")?,
        ),
        LocalLogStorageSelectedActiveGenerationBinding::new(
            LocalLogId::try_new("log:g1")?,
            LocalSessionId::try_new(SESSION)?,
            frame(1_024),
            LocalLogStorageFenceId::try_new("fence:f0")?,
            LocalLogStorageHeadId::try_new("head:h0")?,
        ),
    )?;
    let error = LocalLogStorageSelectedJsonCodec::new(context.clone(), mismatched_binding)
        .normalize_root(&json)
        .err()
        .ok_or("corrupt checkpoint log was accepted")?;
    assert_eq!(
        error,
        LocalLogStorageSelectedRootError::GenerationMismatch {
            role: LocalLogStorageSelectedRootValueRole::Current,
            field: LocalLogStorageSelectedRootGenerationField::CheckpointLogId,
        }
    );

    let payload = format!("{{\"{SENTINEL}\":true}}");
    let payload_error = LocalLogStorageSelectedJsonCodec::new(context, root_binding()?)
        .normalize_root(&payload)
        .err()
        .ok_or("attacker payload was accepted")?;
    assert_payload_free(&payload_error, SENTINEL);
    assert_eq!(
        LocalLogStorageSelectedRootGenerationField::CheckpointFrame.as_str(),
        "checkpoint.frame"
    );
    assert_eq!(LocalLogStorageSelectedRootReceiptField::SessionId.as_str(), "sessionId");
    Ok(())
}

fn assert_payload_free(error: &(dyn Error + 'static), sentinel: &str) {
    assert!(!error.to_string().contains(sentinel));
    assert!(!format!("{error:?}").contains(sentinel));
    let mut source = error.source();
    while let Some(current) = source {
        assert!(!current.to_string().contains(sentinel));
        assert!(!format!("{current:?}").contains(sentinel));
        source = current.source();
    }
}
