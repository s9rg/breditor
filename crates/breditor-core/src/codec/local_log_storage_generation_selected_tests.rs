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
    LocalLogStorageGenerationBinding, LocalLogStorageGenerationBindingField,
    LocalLogStorageGenerationCodecError, LocalLogStorageGenerationContinuityError,
    LocalLogStorageGenerationContinuityErrorCode, LocalLogStorageGenerationFrameV1,
    LocalLogStorageGenerationJsonCodec, LocalLogStorageGenerationManifest,
    LocalLogStorageGenerationManifestParts, LocalLogStorageGenerationPreparationInputs,
    LocalLogStorageSelectedRoot, LocalLogStorageSelectedRootParts, LocalLogStorageSelectionKind,
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
        let context = EditorContext::default();
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(
                r#"{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":[{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}]}}"#,
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
        let (selected_head, previous_head, next_head) = match kind {
            LocalLogStorageSelectionKind::Root => ("head:h0", None, "head:h1"),
            LocalLogStorageSelectionKind::Rotation => ("head:h1", Some("head:h0"), "head:h2"),
        };
        let (selected_transaction, next_transaction, selected_fence, next_fence) = match kind {
            LocalLogStorageSelectionKind::Root => {
                ("transaction:t0", "transaction:t1", "fence:f0", "fence:f1")
            }
            LocalLogStorageSelectionKind::Rotation => {
                ("transaction:t1", "transaction:t2", "fence:f1", "fence:f2")
            }
        };

        let session_id = LocalSessionId::try_new(SESSION)?;
        let checkpoint_log_id = LocalLogId::try_new(checkpoint_log)?;
        let active_log_id = LocalLogId::try_new(active_log)?;
        let successor_log_id = LocalLogId::try_new(successor_log)?;
        let anchor = LocalLogRecovery::new(session_id.clone(), checkpoint_log_id.clone())
            .recover(EditorSession::new(state), Vec::new())?
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
        let selected_anchor = checkpoint_codec.decode(&checkpoint_json)?;

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
        let selected_head_id = LocalLogStorageHeadId::try_new(selected_head)?;
        let selected = LocalLogStorageSelectedRoot::from_parts(LocalLogStorageSelectedRootParts {
            profile_id: profile_id.clone(),
            profile_version,
            database_incarnation_id: LocalLogStorageDatabaseIncarnationId::try_new(
                "database:selected-rotation-tests",
            )?,
            scope_id: scope_id.clone(),
            scope_incarnation_id: LocalLogStorageScopeIncarnationId::try_new(
                "scope-incarnation:selected-rotation-tests",
            )?,
            selected_head_id: selected_head_id.clone(),
            previous_head_id: previous_head.map(LocalLogStorageHeadId::try_new).transpose()?,
            selection_kind: kind,
            transaction_id: LocalLogStorageTransactionId::try_new(selected_transaction)?,
            activation_fence_id: LocalLogStorageFenceId::try_new(selected_fence)?,
            session_id,
            checkpoint_log_id,
            active_log_id,
            active_frame: LocalLogStorageGenerationFrameV1::new(active_frame_limits),
            checkpoint_json,
            checkpoint_anchor: selected_anchor,
        });
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
