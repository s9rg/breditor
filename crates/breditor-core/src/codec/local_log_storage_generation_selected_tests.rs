use std::error::Error;

use crate::{
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryLimits, LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId,
        LocalLogStorageHeadId, LocalLogStorageProfileId, LocalLogStorageProfileVersion,
        LocalLogStorageScopeId, LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId,
        LocalSessionId,
    },
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};

use super::{
    DocumentJsonCodec, LocalLogCheckpointJsonCodec, LocalLogFrameLimits,
    LocalLogStorageAttemptPreparationErrorCode, LocalLogStorageAttemptRequest,
    LocalLogStorageAttemptTransitionError, LocalLogStorageGenerationBinding,
    LocalLogStorageGenerationBindingField, LocalLogStorageGenerationCodecError,
    LocalLogStorageGenerationContinuityError, LocalLogStorageGenerationContinuityErrorCode,
    LocalLogStorageGenerationFrameV1, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationLimits, LocalLogStorageGenerationManifest,
    LocalLogStorageGenerationManifestParts, LocalLogStorageGenerationPreparationInputs,
    LocalLogStorageRootBinding, LocalLogStorageRootJsonCodec, LocalLogStorageRootSelection,
    LocalLogStorageRootSelectionParts, LocalLogStorageSelectedActiveGenerationBinding,
    LocalLogStorageSelectedBinding, LocalLogStorageSelectedCheckpointGenerationBinding,
    LocalLogStorageSelectedCheckpointGenerationState, LocalLogStorageSelectedJsonCodec,
    LocalLogStorageSelectedRoot, LocalLogStorageSelectedRootErrorCode,
    LocalLogStorageSelectionKind, LocalLogStorageSelectionReceiptBinding,
    LocalLogTailCompactionOutcome, local_log_storage_generation_json::manifest_record,
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const PROFILE: &str = "breditor/selected-rotation-tests";
const SCOPE: &str = "scope:selected-rotation-tests";
const SESSION: &str = "session:selected-rotation-tests";

struct SelectedRotationFixture {
    context: EditorContext,
    selected: LocalLogStorageSelectedRoot,
    outcome: LocalLogTailCompactionOutcome,
    binding: LocalLogStorageGenerationBinding,
    inputs: LocalLogStorageGenerationPreparationInputs,
}

impl SelectedRotationFixture {
    fn new(kind: LocalLogStorageSelectionKind) -> TestResult<Self> {
        Self::new_with_reclaimed_checkpoint(kind, false)
    }

    fn reclaimed_rotation() -> TestResult<Self> {
        Self::new_with_reclaimed_checkpoint(LocalLogStorageSelectionKind::Rotation, true)
    }

    #[allow(clippy::too_many_lines)]
    fn new_with_reclaimed_checkpoint(
        kind: LocalLogStorageSelectionKind,
        reclaimed_checkpoint: bool,
    ) -> TestResult<Self> {
        if kind == LocalLogStorageSelectionKind::Root && reclaimed_checkpoint {
            return Err("a root fixture cannot have a reclaimed checkpoint".into());
        }
        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(
                r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[{"kind":"text","text":"ROTATIONATTEMPTPAYLOADSENTINEL","formats":[]}]}]}}"#,
            )?;
        let state = EditorState::try_new(
            &context,
            LineageId::try_new("selected-rotation-action-tests")?,
            document,
            None,
            None,
        )?;

        let (checkpoint_log, active_log, successor_log) = match kind {
            LocalLogStorageSelectionKind::Root => ("log:g0", "log:g1", "log:g2"),
            LocalLogStorageSelectionKind::Rotation => ("log:g1", "log:g2", "log:g3"),
        };
        let (selected_head, next_head) = match kind {
            LocalLogStorageSelectionKind::Root => ("head:h0", "head:h1"),
            LocalLogStorageSelectionKind::Rotation => ("head:h1", "head:h2"),
        };
        let (next_transaction, next_fence) = match kind {
            LocalLogStorageSelectionKind::Root => ("transaction:t1", "fence:f1"),
            LocalLogStorageSelectionKind::Rotation => ("transaction:t2", "fence:f2"),
        };

        let session_id = LocalSessionId::try_new(SESSION)?;
        let checkpoint_log_id = LocalLogId::try_new(checkpoint_log)?;
        let active_log_id = LocalLogId::try_new(active_log)?;
        let successor_log_id = LocalLogId::try_new(successor_log)?;
        let anchor = LocalLogRecovery::new(session_id.clone(), checkpoint_log_id.clone())
            .recover(EditorSession::new(state.clone()), Vec::new())?
            .try_into_checkpoint_anchor(
                active_log_id.clone(),
                LocalLogCompactionLimits::default(),
            )?;
        let checkpoint_codec = LocalLogCheckpointJsonCodec::new(
            context.clone(),
            LocalLogCheckpointBinding::try_new(
                session_id.clone(),
                checkpoint_log_id.clone(),
                active_log_id.clone(),
            )?,
        );
        let checkpoint_json = checkpoint_codec.encode(&anchor)?;

        let active_frame_limits = LocalLogFrameLimits::new(4_096);
        let cursor =
            anchor.begin_successor_tail(LocalLogRecoveryLimits::default(), active_frame_limits);
        let (owner, _, retained_frame_limits) = cursor.into_parts();
        let outcome =
            super::LocalLogTailCursor::from_trusted_parts(owner, 123, retained_frame_limits)
                .try_into_checkpoint_anchor(successor_log_id)?;

        let profile_id = LocalLogStorageProfileId::try_new(PROFILE)?;
        let profile_version = LocalLogStorageProfileVersion::try_new(1)?;
        let scope_id = LocalLogStorageScopeId::try_new(SCOPE)?;
        let database_incarnation_id =
            LocalLogStorageDatabaseIncarnationId::try_new("database:selected-rotation-tests")?;
        let scope_incarnation_id = LocalLogStorageScopeIncarnationId::try_new(
            "scope-incarnation:selected-rotation-tests",
        )?;
        let selected_head_id = LocalLogStorageHeadId::try_new(selected_head)?;

        let receipt = |selection_kind,
                       transaction_id: &str,
                       expected_head_id: Option<&str>,
                       committed_head_id: &str|
         -> TestResult<LocalLogStorageSelectionReceiptBinding> {
            Ok(LocalLogStorageSelectionReceiptBinding::try_new(
                profile_id.clone(),
                profile_version,
                database_incarnation_id.clone(),
                scope_id.clone(),
                scope_incarnation_id.clone(),
                LocalLogStorageTransactionId::try_new(transaction_id)?,
                expected_head_id.map(LocalLogStorageHeadId::try_new).transpose()?,
                LocalLogStorageHeadId::try_new(committed_head_id)?,
                selection_kind,
                session_id.clone(),
            )?)
        };
        let active_frame = LocalLogStorageGenerationFrameV1::new(active_frame_limits);
        let (selected_binding, current_selection_json, predecessor_selection_json) = match kind {
            LocalLogStorageSelectionKind::Root => {
                let current_receipt =
                    receipt(LocalLogStorageSelectionKind::Root, "transaction:t0", None, "head:h0")?;
                let selected_binding = LocalLogStorageSelectedBinding::try_new(
                    current_receipt,
                    None,
                    LocalLogStorageSelectedCheckpointGenerationBinding::checkpoint_only(
                        checkpoint_log_id.clone(),
                        session_id.clone(),
                        selected_head_id.clone(),
                    ),
                    LocalLogStorageSelectedActiveGenerationBinding::new(
                        active_log_id.clone(),
                        session_id.clone(),
                        active_frame,
                        LocalLogStorageFenceId::try_new("fence:f0")?,
                        selected_head_id.clone(),
                    ),
                )?;
                let selection =
                    LocalLogStorageRootSelection::from_parts(LocalLogStorageRootSelectionParts {
                        profile_id: profile_id.clone(),
                        profile_version,
                        scope_id: scope_id.clone(),
                        transaction_id: LocalLogStorageTransactionId::try_new("transaction:t0")?,
                        committed_head_id: selected_head_id.clone(),
                        fence_id: LocalLogStorageFenceId::try_new("fence:f0")?,
                        session_id: session_id.clone(),
                        checkpoint_log_id: checkpoint_log_id.clone(),
                        active_log_id: active_log_id.clone(),
                        active_frame,
                        checkpoint_json: checkpoint_json.clone(),
                    });
                let codec = LocalLogStorageRootJsonCodec::new(
                    context.clone(),
                    LocalLogStorageRootBinding::new(
                        profile_id.clone(),
                        profile_version,
                        scope_id.clone(),
                        selected_head_id.clone(),
                    ),
                );
                (selected_binding, codec.encode_root(&selection)?, None)
            }
            LocalLogStorageSelectionKind::Rotation => {
                let predecessor_frame =
                    LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(2_048));
                let current_receipt = receipt(
                    LocalLogStorageSelectionKind::Rotation,
                    "transaction:t1",
                    Some("head:h0"),
                    "head:h1",
                )?;
                let predecessor_receipt =
                    receipt(LocalLogStorageSelectionKind::Root, "transaction:t0", None, "head:h0")?;
                let checkpoint_generation = if reclaimed_checkpoint {
                    LocalLogStorageSelectedCheckpointGenerationBinding::reclaimed(
                        checkpoint_log_id.clone(),
                        session_id.clone(),
                        predecessor_frame,
                        LocalLogStorageFenceId::try_new("fence:f0")?,
                        LocalLogStorageHeadId::try_new("head:h0")?,
                        selected_head_id.clone(),
                    )
                } else {
                    LocalLogStorageSelectedCheckpointGenerationBinding::retired(
                        checkpoint_log_id.clone(),
                        session_id.clone(),
                        predecessor_frame,
                        LocalLogStorageFenceId::try_new("fence:f0")?,
                        LocalLogStorageHeadId::try_new("head:h0")?,
                        selected_head_id.clone(),
                    )
                };
                let selected_binding = LocalLogStorageSelectedBinding::try_new(
                    current_receipt,
                    Some(predecessor_receipt),
                    checkpoint_generation,
                    LocalLogStorageSelectedActiveGenerationBinding::new(
                        active_log_id.clone(),
                        session_id.clone(),
                        active_frame,
                        LocalLogStorageFenceId::try_new("fence:f1")?,
                        selected_head_id.clone(),
                    ),
                )?;
                let current = LocalLogStorageGenerationManifest::from_parts(
                    LocalLogStorageGenerationManifestParts {
                        profile_id: profile_id.clone(),
                        profile_version,
                        scope_id: scope_id.clone(),
                        transaction_id: LocalLogStorageTransactionId::try_new("transaction:t1")?,
                        expected_head_id: LocalLogStorageHeadId::try_new("head:h0")?,
                        committed_head_id: selected_head_id.clone(),
                        fence_id: LocalLogStorageFenceId::try_new("fence:f1")?,
                        session_id: session_id.clone(),
                        sealed_log_id: checkpoint_log_id.clone(),
                        successor_log_id: active_log_id.clone(),
                        accepted_prefix_bytes: 0,
                        sealed_frame: predecessor_frame,
                        successor_frame: active_frame,
                        checkpoint_json: checkpoint_json.clone(),
                    },
                );
                let predecessor_checkpoint_log_id = LocalLogId::try_new("log:g0")?;
                let predecessor_anchor = LocalLogRecovery::new(
                    session_id.clone(),
                    predecessor_checkpoint_log_id.clone(),
                )
                .recover(EditorSession::new(state), Vec::new())?
                .try_into_checkpoint_anchor(
                    checkpoint_log_id.clone(),
                    LocalLogCompactionLimits::default(),
                )?;
                let predecessor_checkpoint_json = LocalLogCheckpointJsonCodec::new(
                    context.clone(),
                    LocalLogCheckpointBinding::try_new(
                        session_id.clone(),
                        predecessor_checkpoint_log_id.clone(),
                        checkpoint_log_id.clone(),
                    )?,
                )
                .encode(&predecessor_anchor)?;
                let predecessor =
                    LocalLogStorageRootSelection::from_parts(LocalLogStorageRootSelectionParts {
                        profile_id: profile_id.clone(),
                        profile_version,
                        scope_id: scope_id.clone(),
                        transaction_id: LocalLogStorageTransactionId::try_new("transaction:t0")?,
                        committed_head_id: LocalLogStorageHeadId::try_new("head:h0")?,
                        fence_id: LocalLogStorageFenceId::try_new("fence:f0")?,
                        session_id: session_id.clone(),
                        checkpoint_log_id: predecessor_checkpoint_log_id,
                        active_log_id: checkpoint_log_id.clone(),
                        active_frame: predecessor_frame,
                        checkpoint_json: predecessor_checkpoint_json,
                    });
                let predecessor_codec = LocalLogStorageRootJsonCodec::new(
                    context.clone(),
                    LocalLogStorageRootBinding::new(
                        profile_id.clone(),
                        profile_version,
                        scope_id.clone(),
                        LocalLogStorageHeadId::try_new("head:h0")?,
                    ),
                );
                (
                    selected_binding,
                    serde_json::to_string(&manifest_record(&current))?,
                    Some(predecessor_codec.encode_root(&predecessor)?),
                )
            }
        };
        let selected_codec =
            LocalLogStorageSelectedJsonCodec::new(context.clone(), selected_binding);
        let selected = match (kind, predecessor_selection_json.as_deref()) {
            (LocalLogStorageSelectionKind::Root, None) => {
                selected_codec.normalize_root(&current_selection_json)?
            }
            (LocalLogStorageSelectionKind::Rotation, Some(predecessor_json)) => {
                selected_codec.normalize_rotation(&current_selection_json, predecessor_json)?
            }
            _ => return Err("selected fixture envelope shape disagrees with its kind".into()),
        };
        let binding = LocalLogStorageGenerationBinding::try_new(
            profile_id,
            profile_version,
            scope_id,
            selected_head_id,
            LocalLogStorageHeadId::try_new(next_head)?,
        )?;
        let inputs = LocalLogStorageGenerationPreparationInputs::new(
            LocalLogStorageTransactionId::try_new(next_transaction)?,
            LocalLogStorageFenceId::try_new(next_fence)?,
            LocalLogFrameLimits::new(8_192),
        );
        Ok(Self { context, selected, outcome, binding, inputs })
    }

    fn codec(&self) -> LocalLogStorageGenerationJsonCodec {
        LocalLogStorageGenerationJsonCodec::new(self.context.clone(), self.binding.clone())
    }

    fn prepared(
        &self,
    ) -> Result<LocalLogStorageGenerationManifest, LocalLogStorageGenerationCodecError> {
        self.codec().prepare_rotation_from_selected(&self.selected, &self.outcome, &self.inputs)
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

fn assert_continuity(
    result: &Result<LocalLogStorageGenerationManifest, LocalLogStorageGenerationCodecError>,
    expected: LocalLogStorageGenerationContinuityError,
) {
    assert!(matches!(
        result,
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(actual)) if *actual == expected
    ));
}

#[test]
fn root_and_rotation_selected_values_support_the_exact_next_rotation_boundary() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(kind)?;
        let codec = fixture.codec();
        let manifest = fixture.prepared()?;
        let encoded = codec.encode_rotation_from_selected(&manifest, &fixture.selected)?;
        let decoded = codec.decode_rotation_from_selected(&encoded, &fixture.selected)?;

        assert_eq!(decoded, manifest);
        assert_eq!(decoded.expected_head_id(), fixture.selected.selected_head_id());
        assert_eq!(decoded.sealed_log_id(), fixture.selected.active_log_id());
        assert_eq!(decoded.sealed_frame(), fixture.selected.active_frame());
        assert_eq!(decoded.transaction_id(), fixture.inputs.transaction_id());
        assert_eq!(decoded.fence_id(), fixture.inputs.fence_id());
    }
    Ok(())
}

#[test]
fn preparation_rejects_each_trusted_selected_binding_change_before_outcome_work() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let next_head = fixture.binding.committed_head_id().clone();
    let cases = [
        (
            LocalLogStorageGenerationBinding::try_new(
                LocalLogStorageProfileId::try_new("breditor/other-profile")?,
                fixture.selected.profile_version(),
                fixture.selected.scope_id().clone(),
                fixture.selected.selected_head_id().clone(),
                next_head.clone(),
            )?,
            LocalLogStorageGenerationContinuityError::ProfileIdChanged,
        ),
        (
            LocalLogStorageGenerationBinding::try_new(
                fixture.selected.profile_id().clone(),
                LocalLogStorageProfileVersion::try_new(2)?,
                fixture.selected.scope_id().clone(),
                fixture.selected.selected_head_id().clone(),
                next_head.clone(),
            )?,
            LocalLogStorageGenerationContinuityError::ProfileVersionChanged,
        ),
        (
            LocalLogStorageGenerationBinding::try_new(
                fixture.selected.profile_id().clone(),
                fixture.selected.profile_version(),
                LocalLogStorageScopeId::try_new("scope:other")?,
                fixture.selected.selected_head_id().clone(),
                next_head.clone(),
            )?,
            LocalLogStorageGenerationContinuityError::ScopeIdChanged,
        ),
        (
            LocalLogStorageGenerationBinding::try_new(
                fixture.selected.profile_id().clone(),
                fixture.selected.profile_version(),
                fixture.selected.scope_id().clone(),
                LocalLogStorageHeadId::try_new("head:other-expected")?,
                next_head,
            )?,
            LocalLogStorageGenerationContinuityError::ExpectedHeadMismatch,
        ),
    ];

    for (binding, expected) in cases {
        let codec = LocalLogStorageGenerationJsonCodec::new(fixture.context.clone(), binding);
        assert_continuity(
            &codec.prepare_rotation_from_selected(
                &fixture.selected,
                &fixture.outcome,
                &fixture.inputs,
            ),
            expected,
        );
    }
    Ok(())
}

#[test]
fn preparation_rejects_every_immediately_known_identity_reuse() -> TestResult {
    let root = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let reused_transaction = LocalLogStorageGenerationPreparationInputs::new(
        root.selected.transaction_id().clone(),
        root.inputs.fence_id().clone(),
        root.inputs.successor_frame_limits(),
    );
    assert_continuity(
        &root.codec().prepare_rotation_from_selected(
            &root.selected,
            &root.outcome,
            &reused_transaction,
        ),
        LocalLogStorageGenerationContinuityError::TransactionIdReused,
    );

    let reused_fence = LocalLogStorageGenerationPreparationInputs::new(
        root.inputs.transaction_id().clone(),
        root.selected.activation_fence_id().clone(),
        root.inputs.successor_frame_limits(),
    );
    assert_continuity(
        &root.codec().prepare_rotation_from_selected(&root.selected, &root.outcome, &reused_fence),
        LocalLogStorageGenerationContinuityError::KnownFenceIdReused,
    );

    let rotation = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let reused_head_binding = LocalLogStorageGenerationBinding::try_new(
        rotation.selected.profile_id().clone(),
        rotation.selected.profile_version(),
        rotation.selected.scope_id().clone(),
        rotation.selected.selected_head_id().clone(),
        rotation.selected.previous_head_id().ok_or("rotation needs a previous head")?.clone(),
    )?;
    assert_continuity(
        &LocalLogStorageGenerationJsonCodec::new(rotation.context.clone(), reused_head_binding)
            .prepare_rotation_from_selected(
                &rotation.selected,
                &rotation.outcome,
                &rotation.inputs,
            ),
        LocalLogStorageGenerationContinuityError::KnownHeadIdReused,
    );
    Ok(())
}

#[test]
fn encode_rejects_all_selected_edge_mismatches_before_nested_checkpoint_replay() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let codec = fixture.codec();
    let manifest = fixture.prepared()?;

    let mut parts = copied_manifest_parts(&manifest);
    parts.session_id = LocalSessionId::try_new("session:other")?;
    assert!(matches!(
        codec.encode_rotation_from_selected(
            &LocalLogStorageGenerationManifest::from_parts(parts),
            &fixture.selected,
        ),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::SessionIdChanged
        ))
    ));

    let mut parts = copied_manifest_parts(&manifest);
    parts.sealed_log_id = LocalLogId::try_new("log:other-sealed")?;
    assert!(matches!(
        codec.encode_rotation_from_selected(
            &LocalLogStorageGenerationManifest::from_parts(parts),
            &fixture.selected,
        ),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::SealedLogMismatch
        ))
    ));

    let mut parts = copied_manifest_parts(&manifest);
    parts.sealed_frame = LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(17));
    assert!(matches!(
        codec.encode_rotation_from_selected(
            &LocalLogStorageGenerationManifest::from_parts(parts),
            &fixture.selected,
        ),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::SealedFrameMismatch
        ))
    ));

    let mut parts = copied_manifest_parts(&manifest);
    parts.successor_log_id = fixture.selected.checkpoint_log_id().clone();
    assert!(matches!(
        codec.encode_rotation_from_selected(
            &LocalLogStorageGenerationManifest::from_parts(parts),
            &fixture.selected,
        ),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::KnownGenerationIdReused
        ))
    ));

    let mut parts = copied_manifest_parts(&manifest);
    parts.fence_id = fixture.selected.activation_fence_id().clone();
    assert!(matches!(
        codec.encode_rotation_from_selected(
            &LocalLogStorageGenerationManifest::from_parts(parts),
            &fixture.selected,
        ),
        Err(LocalLogStorageGenerationCodecError::InvalidContinuity(
            LocalLogStorageGenerationContinuityError::KnownFenceIdReused
        ))
    ));
    Ok(())
}

#[test]
fn decode_rechecks_selected_identity_freshness_after_strict_canonical_decode() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let codec = fixture.codec();
    let manifest = fixture.prepared()?;
    let mut parts = copied_manifest_parts(&manifest);
    parts.transaction_id = fixture.selected.transaction_id().clone();
    let reused = LocalLogStorageGenerationManifest::from_parts(parts);
    let encoded = serde_json::to_string(&manifest_record(&reused))?;

    assert_continuity(
        &codec.decode_rotation_from_selected(&encoded, &fixture.selected),
        LocalLogStorageGenerationContinuityError::TransactionIdReused,
    );
    Ok(())
}

#[test]
fn selected_binding_precedes_identity_and_outcome_validation() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let binding = LocalLogStorageGenerationBinding::try_new(
        LocalLogStorageProfileId::try_new("breditor/other-profile")?,
        fixture.selected.profile_version(),
        fixture.selected.scope_id().clone(),
        fixture.selected.selected_head_id().clone(),
        fixture.binding.committed_head_id().clone(),
    )?;
    let reused = LocalLogStorageGenerationPreparationInputs::new(
        fixture.selected.transaction_id().clone(),
        fixture.selected.activation_fence_id().clone(),
        fixture.inputs.successor_frame_limits(),
    );
    assert_continuity(
        &LocalLogStorageGenerationJsonCodec::new(fixture.context.clone(), binding)
            .prepare_rotation_from_selected(&fixture.selected, &fixture.outcome, &reused),
        LocalLogStorageGenerationContinuityError::ProfileIdChanged,
    );
    assert_eq!(
        LocalLogStorageGenerationContinuityError::KnownFenceIdReused.code(),
        LocalLogStorageGenerationContinuityErrorCode::KnownFenceIdReused
    );
    assert_eq!(
        LocalLogStorageGenerationContinuityErrorCode::KnownFenceIdReused.as_str(),
        "local_log_storage_generation_continuity.known_fence_id_reused"
    );
    assert_eq!(LocalLogStorageGenerationBindingField::SealedFrame.as_str(), "sealedFrame");
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn exact_rotation_attempt_snapshots_selected_envelope_and_candidate_binding() -> TestResult {
    for selected_kind in
        [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation]
    {
        let fixture = SelectedRotationFixture::new(selected_kind)?;
        let codec = fixture.codec();
        let manifest = fixture.prepared()?;
        let expected_candidate_json =
            codec.encode_rotation_from_selected(&manifest, &fixture.selected)?;
        let (expected_selected_binding, _, _) = fixture.selected.snapshot_attempt_envelope();
        let expected_current = fixture.selected.current_selection_json().to_owned();
        let expected_predecessor = fixture.selected.predecessor_selection_json().map(str::to_owned);
        let current_pointer = fixture.selected.current_selection_json().as_ptr();
        let predecessor_pointer = fixture.selected.predecessor_selection_json().map(str::as_ptr);
        let expected_candidate_binding = LocalLogStorageSelectedBinding::try_new(
            LocalLogStorageSelectionReceiptBinding::try_new(
                manifest.profile_id().clone(),
                manifest.profile_version(),
                fixture.selected.database_incarnation_id().clone(),
                manifest.scope_id().clone(),
                fixture.selected.scope_incarnation_id().clone(),
                manifest.transaction_id().clone(),
                Some(manifest.expected_head_id().clone()),
                manifest.committed_head_id().clone(),
                LocalLogStorageSelectionKind::Rotation,
                manifest.session_id().clone(),
            )?,
            Some(expected_selected_binding.current_receipt().clone()),
            LocalLogStorageSelectedCheckpointGenerationBinding::retired(
                fixture.selected.active_log_id().clone(),
                manifest.session_id().clone(),
                fixture.selected.active_frame(),
                fixture.selected.activation_fence_id().clone(),
                fixture.selected.selected_head_id().clone(),
                manifest.committed_head_id().clone(),
            ),
            LocalLogStorageSelectedActiveGenerationBinding::new(
                manifest.successor_log_id().clone(),
                manifest.session_id().clone(),
                manifest.successor_frame(),
                manifest.fence_id().clone(),
                manifest.committed_head_id().clone(),
            ),
        )?;

        let prepared = codec.prepare_rotation_attempt(&fixture.selected, &manifest)?;
        assert_eq!(prepared.selection_kind(), LocalLogStorageSelectionKind::Rotation);
        assert_eq!(prepared.selected_binding(), Some(&expected_selected_binding));
        assert_eq!(prepared.candidate_binding(), &expected_candidate_binding);
        assert_eq!(prepared.candidate_json_bytes(), expected_candidate_json.len());
        assert_eq!(prepared.selected_current_json_bytes(), Some(expected_current.len()));
        assert_eq!(
            prepared.selected_predecessor_json_bytes(),
            expected_predecessor.as_ref().map(String::len)
        );
        assert_eq!(
            prepared.retained_json_bytes(),
            Some(
                expected_candidate_json.len()
                    + expected_current.len()
                    + expected_predecessor.as_ref().map_or(0, String::len)
            )
        );
        assert_eq!(
            prepared.candidate_receipt().expected_head_id(),
            Some(fixture.selected.selected_head_id())
        );
        assert_eq!(
            prepared.candidate_binding().predecessor_receipt(),
            Some(fixture.selected.current_receipt())
        );
        assert_eq!(
            prepared.candidate_binding().checkpoint_generation().state(),
            LocalLogStorageSelectedCheckpointGenerationState::Retired
        );
        assert_eq!(
            prepared.candidate_binding().checkpoint_generation().log_id(),
            fixture.selected.active_log_id()
        );
        assert_eq!(
            prepared.candidate_binding().active_generation().log_id(),
            manifest.successor_log_id()
        );
        let prepared_debug = format!("{prepared:?}");
        assert!(expected_candidate_json.contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
        assert!(expected_current.contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
        if let Some(predecessor) = &expected_predecessor {
            assert!(predecessor.contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
        }
        assert!(!prepared_debug.contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
        assert!(!prepared_debug.contains(&expected_candidate_json));
        assert!(!prepared_debug.contains(&expected_current));
        if let Some(predecessor) = &expected_predecessor {
            assert!(!prepared_debug.contains(predecessor));
        }

        let mut uncertain = prepared.begin_attempt();
        assert!(!format!("{uncertain:?}").contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
        let attempt_id = uncertain.attempt_id().clone();
        {
            let request = uncertain.adapter_request()?;
            assert!(!format!("{request:?}").contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
            assert_eq!(request.attempt_id(), &attempt_id);
            assert_eq!(request.candidate_json(), expected_candidate_json);
            let LocalLogStorageAttemptRequest::Rotation(rotation) = request else {
                return Err("rotation plan yielded a root request".into());
            };
            assert_eq!(rotation.candidate_binding(), &expected_candidate_binding);
            assert_eq!(rotation.selected_binding(), &expected_selected_binding);
            assert_eq!(rotation.selected_current_json(), expected_current);
            assert_eq!(rotation.selected_predecessor_json(), expected_predecessor.as_deref());
            assert_eq!(rotation.selected_current_json().as_ptr(), current_pointer);
            assert_eq!(rotation.selected_predecessor_json().map(str::as_ptr), predecessor_pointer);
            let request_debug = format!("{rotation:?}");
            assert!(!request_debug.contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
            assert!(!request_debug.contains(&expected_candidate_json));
            assert!(!request_debug.contains(&expected_current));
            if let Some(predecessor) = &expected_predecessor {
                assert!(!request_debug.contains(predecessor));
            }
        }
        assert!(matches!(
            uncertain.adapter_request(),
            Err(LocalLogStorageAttemptTransitionError::RequestAlreadyBorrowed)
        ));
    }
    Ok(())
}

#[test]
fn exact_rotation_resubmission_preserves_every_byte_and_rejects_prior_identity() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let codec = fixture.codec();
    let manifest = fixture.prepared()?;
    let expected_candidate = codec.encode_rotation_from_selected(&manifest, &fixture.selected)?;
    let expected_current = fixture.selected.current_selection_json().to_owned();
    let expected_predecessor = fixture
        .selected
        .predecessor_selection_json()
        .ok_or("selected rotation omitted predecessor")?
        .to_owned();
    let prepared = codec.prepare_rotation_attempt(&fixture.selected, &manifest)?;
    let expected_candidate_binding = prepared.candidate_binding().clone();
    let mut uncertain = prepared.begin_attempt();
    let prior_id = uncertain.attempt_id().clone();
    let mut seen_attempt_ids = vec![prior_id.clone()];
    let (candidate_pointer, current_pointer, predecessor_pointer) = {
        let request = uncertain.adapter_request()?;
        assert_eq!(request.candidate_json(), expected_candidate);
        let LocalLogStorageAttemptRequest::Rotation(rotation) = request else {
            return Err("rotation attempt yielded a root request".into());
        };
        (
            rotation.candidate_json().as_ptr(),
            rotation.selected_current_json().as_ptr(),
            rotation
                .selected_predecessor_json()
                .ok_or("selected rotation omitted predecessor")?
                .as_ptr(),
        )
    };

    for _ in 0..3 {
        uncertain = uncertain.begin_exact_resubmission();
        let current_id = uncertain.attempt_id().clone();
        assert!(seen_attempt_ids.iter().all(|seen| seen != &current_id));
        assert_eq!(uncertain.require_current_attempt_id(&current_id), Ok(()));
        for seen in &seen_attempt_ids {
            assert_eq!(
                uncertain.require_current_attempt_id(seen),
                Err(LocalLogStorageAttemptTransitionError::AttemptIdMismatch)
            );
        }
        assert_eq!(uncertain.candidate_binding(), &expected_candidate_binding);
        let request = uncertain.adapter_request()?;
        let LocalLogStorageAttemptRequest::Rotation(rotation) = request else {
            return Err("rotation retry yielded a root request".into());
        };
        assert_eq!(rotation.candidate_json(), expected_candidate);
        assert_eq!(rotation.selected_current_json(), expected_current);
        assert_eq!(rotation.selected_predecessor_json(), Some(expected_predecessor.as_str()));
        assert_eq!(rotation.candidate_json().as_ptr(), candidate_pointer);
        assert_eq!(rotation.selected_current_json().as_ptr(), current_pointer);
        assert_eq!(
            rotation
                .selected_predecessor_json()
                .ok_or("rotation retry omitted predecessor")?
                .as_ptr(),
            predecessor_pointer
        );
        seen_attempt_ids.push(current_id);
    }
    Ok(())
}

#[test]
fn reclaimed_selected_checkpoint_state_is_preserved_in_attempt_snapshot() -> TestResult {
    let fixture = SelectedRotationFixture::reclaimed_rotation()?;
    let manifest = fixture.prepared()?;
    let (selected_binding, _, _) = fixture.selected.snapshot_attempt_envelope();
    let prepared = fixture.codec().prepare_rotation_attempt(&fixture.selected, &manifest)?;

    assert_eq!(
        selected_binding.checkpoint_generation().state(),
        LocalLogStorageSelectedCheckpointGenerationState::Reclaimed
    );
    assert_eq!(
        prepared
            .selected_binding()
            .ok_or("rotation plan omitted selected binding")?
            .checkpoint_generation()
            .state(),
        LocalLogStorageSelectedCheckpointGenerationState::Reclaimed
    );
    assert_eq!(
        prepared.candidate_binding().checkpoint_generation().state(),
        LocalLogStorageSelectedCheckpointGenerationState::Retired
    );

    let mut uncertain = prepared.begin_attempt();
    let request = uncertain.adapter_request()?;
    let LocalLogStorageAttemptRequest::Rotation(rotation) = request else {
        return Err("rotation plan yielded a root request".into());
    };
    assert_eq!(
        rotation.selected_binding().checkpoint_generation().state(),
        LocalLogStorageSelectedCheckpointGenerationState::Reclaimed
    );
    Ok(())
}

#[test]
fn rotation_attempt_outlives_borrowed_selected_root_and_outcome() -> TestResult {
    let (prepared, expected_candidate, expected_current, expected_predecessor) = {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let codec = fixture.codec();
        let manifest = fixture.prepared()?;
        let candidate = codec.encode_rotation_from_selected(&manifest, &fixture.selected)?;
        let current = fixture.selected.current_selection_json().to_owned();
        let predecessor = fixture
            .selected
            .predecessor_selection_json()
            .ok_or("selected rotation omitted predecessor")?
            .to_owned();
        let prepared = codec.prepare_rotation_attempt(&fixture.selected, &manifest)?;
        (prepared, candidate, current, predecessor)
    };

    let mut uncertain = prepared.begin_attempt();
    let request = uncertain.adapter_request()?;
    let LocalLogStorageAttemptRequest::Rotation(rotation) = request else {
        return Err("rotation plan yielded a root request".into());
    };
    assert_eq!(rotation.candidate_json(), expected_candidate);
    assert_eq!(rotation.selected_current_json(), expected_current);
    assert_eq!(rotation.selected_predecessor_json(), Some(expected_predecessor.as_str()));
    Ok(())
}

#[test]
fn rotation_attempt_final_normalization_enforces_input_limit_without_consuming_inputs() -> TestResult
{
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let codec = fixture.codec();
    let manifest = fixture.prepared()?;
    let expected_candidate = codec.encode_rotation_from_selected(&manifest, &fixture.selected)?;
    let limited = fixture.codec().with_limits(
        LocalLogStorageGenerationLimits::default()
            .with_max_input_bytes(expected_candidate.len() - 1)
            .with_max_output_bytes(expected_candidate.len()),
    );
    let error = limited
        .prepare_rotation_attempt(&fixture.selected, &manifest)
        .err()
        .ok_or("input-limited final rotation normalization unexpectedly succeeded")?;

    assert_eq!(error.code(), LocalLogStorageAttemptPreparationErrorCode::InvalidCandidateEnvelope);
    assert_eq!(error.selection_kind(), LocalLogStorageSelectionKind::Rotation);
    assert_eq!(error.envelope_code(), Some(LocalLogStorageSelectedRootErrorCode::InvalidSelection));
    assert_eq!(error.codec_code(), None);
    assert!(expected_candidate.contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
    assert!(!format!("{error:?}").contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
    assert!(!error.to_string().contains("ROTATIONATTEMPTPAYLOADSENTINEL"));
    assert_eq!(
        codec.encode_rotation_from_selected(&manifest, &fixture.selected)?,
        expected_candidate
    );
    assert_eq!(fixture.selected.transaction_id().as_str(), "transaction:t1");
    Ok(())
}
