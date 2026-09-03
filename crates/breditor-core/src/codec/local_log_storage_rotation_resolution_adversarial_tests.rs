use std::error::Error;

use crate::local_log::{
    LocalLogCheckpointBinding, LocalLogId, LocalLogRecoveryLimits,
    LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId, LocalLogStorageHeadId,
    LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId,
};

use super::{
    LocalLogCheckpointJsonCodec, LocalLogFrameLimits, LocalLogStorageAttemptTerminalAttestation,
    LocalLogStorageAttemptTerminalOutcome, LocalLogStorageGenerationBinding,
    LocalLogStorageGenerationFrameV1, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationManifest, LocalLogStorageGenerationManifestParts,
    LocalLogStorageGenerationPreparationInputs, LocalLogStorageRetiredTransactionBinding,
    LocalLogStorageRootBinding, LocalLogStorageRootJsonCodec,
    LocalLogStorageRotationDifferentCurrentObservation,
    LocalLogStorageRotationDirectSuccessorObservation,
    LocalLogStorageRotationIndexedRetiredTransactionObservation,
    LocalLogStorageRotationOtherScopeObservation,
    LocalLogStorageRotationPriorStillSelectedObservation, LocalLogStorageRotationResolution,
    LocalLogStorageRotationResolutionBrokenAssociation,
    LocalLogStorageRotationResolutionCollisionReason, LocalLogStorageRotationResolutionEvidence,
    LocalLogStorageRotationResolutionIdentityCollision,
    LocalLogStorageRotationResolutionObservation, LocalLogStorageRotationResolutionObservationKind,
    LocalLogStorageRotationResolutionOutcome, LocalLogStorageRotationResolutionOutcomeKind,
    LocalLogStorageRotationResolutionSourceKind, LocalLogStorageRotationResolutionStartError,
    LocalLogStorageRotationResolutionTransitionError, LocalLogStorageRotationRetiredObservation,
    LocalLogStorageRotationSelectedObservation, LocalLogStorageRotationSupersededObservation,
    LocalLogStorageSelectedActiveGenerationBinding, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectedCheckpointGenerationBinding, LocalLogStorageSelectedJsonCodec,
    LocalLogStorageSelectedRoot, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding, LocalLogStorageUncertainAttempt,
    local_log_storage_generation_json::manifest_record,
    local_log_storage_generation_selected_tests::SelectedRotationFixture,
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const PAYLOAD_SENTINEL: &str = "ROTATIONATTEMPTPAYLOADSENTINEL";
const OTHER_DATABASE_INCARNATION: &str = "database:rotation-resolution-other";
const OTHER_SCOPE_INCARNATION: &str = "scope-incarnation:rotation-resolution-other";

fn prepared_uncertain(
    fixture: &SelectedRotationFixture,
) -> TestResult<LocalLogStorageUncertainAttempt> {
    let codec = fixture.codec();
    let manifest = fixture.prepared()?;
    Ok(codec.prepare_rotation_attempt(&fixture.selected, &manifest)?.begin_attempt())
}

fn resolution(
    fixture: &SelectedRotationFixture,
    source: LocalLogStorageRotationResolutionSourceKind,
) -> TestResult<LocalLogStorageRotationResolution> {
    let uncertain = prepared_uncertain(fixture)?;
    match source {
        LocalLogStorageRotationResolutionSourceKind::Uncertain => {
            Ok(uncertain.try_begin_rotation_resolution()?)
        }
        LocalLogStorageRotationResolutionSourceKind::AttemptAborted => {
            let mut uncertain = uncertain;
            let request_id = uncertain.adapter_request()?.request_id().clone();
            let attestation =
                LocalLogStorageAttemptTerminalAttestation::transaction_aborted(&request_id);
            let LocalLogStorageAttemptTerminalOutcome::AttemptAborted(aborted) =
                uncertain.observe_terminal_attestation(attestation)?
            else {
                return Err("abort attestation produced the wrong source state".into());
            };
            Ok(aborted.try_begin_rotation_resolution()?)
        }
        LocalLogStorageRotationResolutionSourceKind::NotAttempted => {
            let attempt_id = uncertain.attempt_id().clone();
            let attestation = LocalLogStorageAttemptTerminalAttestation::not_attempted(&attempt_id);
            let LocalLogStorageAttemptTerminalOutcome::NotAttempted(not_attempted) =
                uncertain.observe_terminal_attestation(attestation)?
            else {
                return Err("not-attempted attestation produced the wrong source state".into());
            };
            Ok(not_attempted.try_begin_rotation_resolution()?)
        }
        LocalLogStorageRotationResolutionSourceKind::HostAttestedCommitted => {
            let mut uncertain = uncertain;
            let request_id = uncertain.adapter_request()?.request_id().clone();
            let attestation =
                LocalLogStorageAttemptTerminalAttestation::publication_completed(&request_id);
            let LocalLogStorageAttemptTerminalOutcome::HostAttestedCommitted(committed) =
                uncertain.observe_terminal_attestation(attestation)?
            else {
                return Err("complete attestation produced the wrong source state".into());
            };
            Ok(committed.try_begin_rotation_resolution()?)
        }
    }
}

fn complete(
    mut resolution: LocalLogStorageRotationResolution,
    observation: LocalLogStorageRotationResolutionObservation,
) -> TestResult<LocalLogStorageRotationResolutionOutcome> {
    let request_id = resolution.adapter_request()?.request_id().clone();
    let evidence =
        LocalLogStorageRotationResolutionEvidence::transaction_completed(&request_id, observation);
    resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
        format!("exactly correlated rotation evidence was rejected: {failure:?}").into()
    })
}

fn collision_reason(
    outcome: LocalLogStorageRotationResolutionOutcome,
) -> TestResult<LocalLogStorageRotationResolutionCollisionReason> {
    let LocalLogStorageRotationResolutionOutcome::CollisionOrCorruption(resolved) = outcome else {
        return Err("conflicting rotation observation did not fail closed".into());
    };
    resolved.collision_reason().ok_or_else(|| "collision outcome omitted its reason".into())
}

fn assert_redacted(value: &str, exact_candidate_json: &str) {
    assert!(!value.contains(PAYLOAD_SENTINEL), "diagnostic exposed the payload sentinel");
    assert!(!value.contains(exact_candidate_json), "diagnostic exposed exact candidate JSON");
}

fn candidate_json(fixture: &SelectedRotationFixture) -> TestResult<String> {
    let codec = fixture.codec();
    let manifest = fixture.prepared()?;
    Ok(codec.encode_rotation_from_selected(&manifest, &fixture.selected)?)
}

fn candidate_selected(
    fixture: &SelectedRotationFixture,
    resolution: &LocalLogStorageRotationResolution,
    alter_payload: bool,
) -> TestResult<LocalLogStorageSelectedRoot> {
    let mut json = candidate_json(fixture)?;
    if alter_payload {
        let exact_bytes = json.len();
        let replacement = "X".repeat(PAYLOAD_SENTINEL.len());
        assert!(json.contains(PAYLOAD_SENTINEL));
        json = json.replacen(PAYLOAD_SENTINEL, &replacement, 1);
        assert_eq!(json.len(), exact_bytes);
    }
    Ok(LocalLogStorageSelectedJsonCodec::new(
        fixture.context.clone(),
        resolution.candidate_binding().clone(),
    )
    .normalize_rotation(&json, fixture.selected.current_selection_json())?)
}

fn prior_selected_with_altered_payload(
    fixture: &SelectedRotationFixture,
) -> TestResult<LocalLogStorageSelectedRoot> {
    let (binding, current_json, predecessor_json) = fixture.selected.snapshot_attempt_envelope();
    let replacement = "Y".repeat(PAYLOAD_SENTINEL.len());
    assert!(current_json.contains(PAYLOAD_SENTINEL));
    let altered = current_json.replacen(PAYLOAD_SENTINEL, &replacement, 1);
    assert_eq!(altered.len(), current_json.len());
    let codec = LocalLogStorageSelectedJsonCodec::new(fixture.context.clone(), binding);
    match (fixture.selected.selection_kind(), predecessor_json.as_deref()) {
        (LocalLogStorageSelectionKind::Root, None) => Ok(codec.normalize_root(&altered)?),
        (LocalLogStorageSelectionKind::Rotation, Some(predecessor_json)) => {
            Ok(codec.normalize_rotation(&altered, predecessor_json)?)
        }
        _ => Err("fixture selected envelope has an inconsistent shape".into()),
    }
}

fn rotate_from_selected(
    context: &crate::state::EditorContext,
    selected: &LocalLogStorageSelectedRoot,
    identity: &str,
    successor_log_override: Option<LocalLogId>,
    fence_override: Option<LocalLogStorageFenceId>,
) -> TestResult<LocalLogStorageSelectedRoot> {
    rotate_from_selected_with_head(
        context,
        selected,
        identity,
        successor_log_override,
        fence_override,
        None,
    )
}

fn rotate_from_selected_with_head(
    context: &crate::state::EditorContext,
    selected: &LocalLogStorageSelectedRoot,
    identity: &str,
    successor_log_override: Option<LocalLogId>,
    fence_override: Option<LocalLogStorageFenceId>,
    committed_head_override: Option<LocalLogStorageHeadId>,
) -> TestResult<LocalLogStorageSelectedRoot> {
    let checkpoint_binding = LocalLogCheckpointBinding::try_new(
        selected.session_id().clone(),
        selected.checkpoint_log_id().clone(),
        selected.active_log_id().clone(),
    )?;
    let anchor = LocalLogCheckpointJsonCodec::new(context.clone(), checkpoint_binding)
        .decode(selected.checkpoint_json())?;
    let cursor = anchor
        .begin_successor_tail(LocalLogRecoveryLimits::default(), selected.active_frame().limits());
    let (owner, _, retained_frame_limits) = cursor.into_parts();
    let successor_log_id = match successor_log_override {
        Some(log_id) => log_id,
        None => LocalLogId::try_new(format!("log:rotation-resolution:{identity}:active"))?,
    };
    let outcome = super::LocalLogTailCursor::from_trusted_parts(owner, 0, retained_frame_limits)
        .try_into_checkpoint_anchor(successor_log_id)?;
    let codec = LocalLogStorageGenerationJsonCodec::new(
        context.clone(),
        LocalLogStorageGenerationBinding::try_new(
            selected.profile_id().clone(),
            selected.profile_version(),
            selected.scope_id().clone(),
            selected.selected_head_id().clone(),
            match committed_head_override {
                Some(head_id) => head_id,
                None => {
                    LocalLogStorageHeadId::try_new(format!("head:rotation-resolution:{identity}"))?
                }
            },
        )?,
    );
    let inputs = LocalLogStorageGenerationPreparationInputs::new(
        LocalLogStorageTransactionId::try_new(format!(
            "transaction:rotation-resolution:{identity}"
        ))?,
        match fence_override {
            Some(fence_id) => fence_id,
            None => {
                LocalLogStorageFenceId::try_new(format!("fence:rotation-resolution:{identity}"))?
            }
        },
        LocalLogFrameLimits::new(16_384),
    );
    let manifest = codec.prepare_rotation_from_selected(selected, &outcome, &inputs)?;
    let json = codec.encode_rotation_from_selected(&manifest, selected)?;
    let binding = codec.prepare_rotation_attempt(selected, &manifest)?.candidate_binding().clone();
    Ok(LocalLogStorageSelectedJsonCodec::new(context.clone(), binding)
        .normalize_rotation(&json, selected.current_selection_json())?)
}

/// Builds a strictly normalizable observation while deliberately bypassing the
/// stronger publication-preparation freshness check under test.
fn rotate_profile_observation_with_historical_reuse(
    context: &crate::state::EditorContext,
    selected: &LocalLogStorageSelectedRoot,
    identity: &str,
    successor_log_override: Option<LocalLogId>,
    committed_head_override: Option<LocalLogStorageHeadId>,
) -> TestResult<LocalLogStorageSelectedRoot> {
    let checkpoint_binding = LocalLogCheckpointBinding::try_new(
        selected.session_id().clone(),
        selected.checkpoint_log_id().clone(),
        selected.active_log_id().clone(),
    )?;
    let anchor = LocalLogCheckpointJsonCodec::new(context.clone(), checkpoint_binding)
        .decode(selected.checkpoint_json())?;
    let cursor = anchor
        .begin_successor_tail(LocalLogRecoveryLimits::default(), selected.active_frame().limits());
    let (owner, _, retained_frame_limits) = cursor.into_parts();
    let successor_log_id = match successor_log_override {
        Some(log_id) => log_id,
        None => LocalLogId::try_new(format!("log:rotation-resolution:{identity}:observed-active"))?,
    };
    let outcome = super::LocalLogTailCursor::from_trusted_parts(owner, 0, retained_frame_limits)
        .try_into_checkpoint_anchor(successor_log_id)?;
    let committed_head_id = match committed_head_override {
        Some(head_id) => head_id,
        None => {
            LocalLogStorageHeadId::try_new(format!("head:rotation-resolution:{identity}:observed"))?
        }
    };
    let transaction_id = LocalLogStorageTransactionId::try_new(format!(
        "transaction:rotation-resolution:{identity}:observed"
    ))?;
    let fence_id =
        LocalLogStorageFenceId::try_new(format!("fence:rotation-resolution:{identity}:observed"))?;
    let successor_frame = LocalLogStorageGenerationFrameV1::new(LocalLogFrameLimits::new(16_384));
    let anchor = outcome.anchor();
    let checkpoint_json = LocalLogCheckpointJsonCodec::new(
        context.clone(),
        LocalLogCheckpointBinding::try_new(
            anchor.session_id().clone(),
            anchor.checkpoint_log_id().clone(),
            anchor.successor_log_id().clone(),
        )?,
    )
    .encode(anchor)?;
    let manifest =
        LocalLogStorageGenerationManifest::from_parts(LocalLogStorageGenerationManifestParts {
            profile_id: selected.profile_id().clone(),
            profile_version: selected.profile_version(),
            scope_id: selected.scope_id().clone(),
            transaction_id: transaction_id.clone(),
            expected_head_id: selected.selected_head_id().clone(),
            committed_head_id: committed_head_id.clone(),
            fence_id: fence_id.clone(),
            session_id: anchor.session_id().clone(),
            sealed_log_id: anchor.checkpoint_log_id().clone(),
            successor_log_id: anchor.successor_log_id().clone(),
            accepted_prefix_bytes: outcome.accepted_prefix_bytes(),
            sealed_frame: LocalLogStorageGenerationFrameV1::new(outcome.frame_limits()),
            successor_frame,
            checkpoint_json,
        });
    let current_json = serde_json::to_string(&manifest_record(&manifest))?;
    let receipt = LocalLogStorageSelectionReceiptBinding::try_new(
        selected.profile_id().clone(),
        selected.profile_version(),
        selected.database_incarnation_id().clone(),
        selected.scope_id().clone(),
        selected.scope_incarnation_id().clone(),
        transaction_id,
        Some(selected.selected_head_id().clone()),
        committed_head_id.clone(),
        LocalLogStorageSelectionKind::Rotation,
        selected.session_id().clone(),
    )?;
    let binding = LocalLogStorageSelectedBinding::try_new(
        receipt,
        Some(selected.current_receipt().clone()),
        LocalLogStorageSelectedCheckpointGenerationBinding::retired(
            manifest.sealed_log_id().clone(),
            manifest.session_id().clone(),
            manifest.sealed_frame(),
            selected.activation_fence_id().clone(),
            selected.selected_head_id().clone(),
            committed_head_id.clone(),
        ),
        LocalLogStorageSelectedActiveGenerationBinding::new(
            manifest.successor_log_id().clone(),
            manifest.session_id().clone(),
            manifest.successor_frame(),
            fence_id,
            committed_head_id,
        ),
    )?;
    Ok(LocalLogStorageSelectedJsonCodec::new(context.clone(), binding)
        .normalize_rotation(&current_json, selected.current_selection_json())?)
}

fn resolution_for_normalized_candidate(
    context: &crate::state::EditorContext,
    prior: &LocalLogStorageSelectedRoot,
    candidate: &LocalLogStorageSelectedRoot,
) -> TestResult<LocalLogStorageRotationResolution> {
    let receipt = candidate.current_receipt();
    let codec = LocalLogStorageGenerationJsonCodec::new(
        context.clone(),
        LocalLogStorageGenerationBinding::try_new(
            receipt.profile_id().clone(),
            receipt.profile_version(),
            receipt.scope_id().clone(),
            receipt
                .expected_head_id()
                .ok_or("normalized rotation candidate omitted its expected head")?
                .clone(),
            receipt.committed_head_id().clone(),
        )?,
    );
    let manifest =
        codec.decode_rotation_from_selected(candidate.current_selection_json(), prior)?;
    let prepared = codec.prepare_rotation_attempt(prior, &manifest)?;
    assert_eq!(prepared.candidate_binding(), candidate.binding());
    Ok(prepared.begin_attempt().try_begin_rotation_resolution()?)
}

fn indexed_retired_with(
    receipt: &LocalLogStorageSelectionReceiptBinding,
    selection_json_bytes: usize,
    index_transaction_id: LocalLogStorageTransactionId,
) -> TestResult<LocalLogStorageRotationIndexedRetiredTransactionObservation> {
    let retired = LocalLogStorageRetiredTransactionBinding::try_new(
        receipt.database_incarnation_id().clone(),
        receipt.scope_id().clone(),
        receipt.scope_incarnation_id().clone(),
        receipt.transaction_id().clone(),
        receipt.expected_head_id().cloned(),
        receipt.committed_head_id().clone(),
        receipt.selection_kind(),
        u64::try_from(selection_json_bytes)?,
    )?;
    Ok(LocalLogStorageRotationIndexedRetiredTransactionObservation::new(
        retired,
        index_transaction_id,
    ))
}

fn indexed_retired(
    receipt: &LocalLogStorageSelectionReceiptBinding,
    selection_json_bytes: usize,
) -> TestResult<LocalLogStorageRotationIndexedRetiredTransactionObservation> {
    indexed_retired_with(receipt, selection_json_bytes, receipt.transaction_id().clone())
}

fn prior_current_retirement(
    resolution: &LocalLogStorageRotationResolution,
) -> TestResult<LocalLogStorageRotationIndexedRetiredTransactionObservation> {
    indexed_retired(
        resolution.selected_binding().current_receipt(),
        resolution.selected_current_json_bytes(),
    )
}

fn prior_predecessor_retirement(
    resolution: &LocalLogStorageRotationResolution,
) -> TestResult<Option<LocalLogStorageRotationIndexedRetiredTransactionObservation>> {
    match (
        resolution.selected_binding().predecessor_receipt(),
        resolution.selected_predecessor_json_bytes(),
    ) {
        (None, None) => Ok(None),
        (Some(receipt), Some(bytes)) => Ok(Some(indexed_retired(receipt, bytes)?)),
        _ => Err("retained rotation context has an inconsistent predecessor envelope".into()),
    }
}

fn candidate_retirement(
    resolution: &LocalLogStorageRotationResolution,
) -> TestResult<LocalLogStorageRotationIndexedRetiredTransactionObservation> {
    indexed_retired(resolution.candidate_receipt(), resolution.candidate_json_bytes())
}

fn prior_still_selected_observation(
    fixture: SelectedRotationFixture,
) -> LocalLogStorageRotationResolutionObservation {
    let current_index = fixture.selected.transaction_id().clone();
    LocalLogStorageRotationResolutionObservation::candidate_absent_prior_still_selected(
        LocalLogStorageRotationPriorStillSelectedObservation::new(fixture.selected, current_index),
    )
}

fn different_current_observation(
    fixture: &SelectedRotationFixture,
    resolution: &LocalLogStorageRotationResolution,
    identity: &str,
) -> TestResult<LocalLogStorageRotationResolutionObservation> {
    let selected = rotate_from_selected(&fixture.context, &fixture.selected, identity, None, None)?;
    let current_index = selected.transaction_id().clone();
    Ok(LocalLogStorageRotationResolutionObservation::candidate_absent_different_current(
        LocalLogStorageRotationDifferentCurrentObservation::new(
            selected,
            current_index,
            resolution.selected_binding().checkpoint_generation().clone(),
            prior_predecessor_retirement(resolution)?,
        ),
    ))
}

fn selected_observation(
    fixture: &SelectedRotationFixture,
    resolution: &LocalLogStorageRotationResolution,
    alter_payload: bool,
) -> TestResult<LocalLogStorageRotationResolutionObservation> {
    let selected = candidate_selected(fixture, resolution, alter_payload)?;
    Ok(LocalLogStorageRotationResolutionObservation::candidate_selected(
        LocalLogStorageRotationSelectedObservation::new(
            selected,
            resolution.candidate_receipt().transaction_id().clone(),
            resolution.selected_binding().checkpoint_generation().clone(),
            prior_predecessor_retirement(resolution)?,
        ),
    ))
}

fn superseded_case(
    fixture: &SelectedRotationFixture,
    source: LocalLogStorageRotationResolutionSourceKind,
) -> TestResult<(LocalLogStorageRotationResolution, LocalLogStorageRotationResolutionObservation)> {
    let resolution = resolution(fixture, source)?;
    let candidate = candidate_selected(fixture, &resolution, false)?;
    let candidate_checkpoint_generation = candidate.binding().checkpoint_generation().clone();
    let current =
        rotate_from_selected(&fixture.context, &candidate, "superseding-current", None, None)?;
    let current_index = current.transaction_id().clone();
    let observation = LocalLogStorageRotationResolutionObservation::candidate_immediate_predecessor(
        LocalLogStorageRotationSupersededObservation::new(
            current,
            resolution.candidate_receipt().transaction_id().clone(),
            current_index,
            candidate_checkpoint_generation,
            resolution.selected_binding().checkpoint_generation().clone(),
            prior_current_retirement(&resolution)?,
            prior_predecessor_retirement(&resolution)?,
        ),
    );
    Ok((resolution, observation))
}

#[derive(Clone, Copy)]
enum SupersededCorruption {
    CandidateIndex,
    CurrentIndex,
    CandidateBytes,
    CandidateCheckpoint,
    PriorCheckpoint,
    PriorCurrentLength,
    PriorCurrentIndex,
    MissingPriorPredecessor,
}

fn corrupted_superseded_case(
    fixture: &SelectedRotationFixture,
    corruption: SupersededCorruption,
) -> TestResult<(LocalLogStorageRotationResolution, LocalLogStorageRotationResolutionObservation)> {
    let resolution = resolution(fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let candidate = candidate_selected(
        fixture,
        &resolution,
        matches!(corruption, SupersededCorruption::CandidateBytes),
    )?;
    let exact_candidate_checkpoint = candidate.binding().checkpoint_generation().clone();
    let exact_prior_checkpoint = resolution.selected_binding().checkpoint_generation().clone();
    let current = rotate_from_selected(
        &fixture.context,
        &candidate,
        "corrupted-superseding-current",
        None,
        None,
    )?;
    let exact_current_index = current.transaction_id().clone();
    let candidate_index = if matches!(corruption, SupersededCorruption::CandidateIndex) {
        LocalLogStorageTransactionId::try_new("transaction:wrong-superseded-candidate-index")?
    } else {
        resolution.candidate_receipt().transaction_id().clone()
    };
    let current_index = if matches!(corruption, SupersededCorruption::CurrentIndex) {
        LocalLogStorageTransactionId::try_new("transaction:wrong-superseded-current-index")?
    } else {
        exact_current_index
    };
    let candidate_checkpoint = if matches!(corruption, SupersededCorruption::CandidateCheckpoint) {
        exact_prior_checkpoint.clone()
    } else {
        exact_candidate_checkpoint.clone()
    };
    let prior_checkpoint = if matches!(corruption, SupersededCorruption::PriorCheckpoint) {
        exact_candidate_checkpoint
    } else {
        exact_prior_checkpoint
    };
    let prior_current = match corruption {
        SupersededCorruption::PriorCurrentLength => indexed_retired(
            resolution.selected_binding().current_receipt(),
            resolution
                .selected_current_json_bytes()
                .checked_add(1)
                .ok_or("test byte length overflowed")?,
        )?,
        SupersededCorruption::PriorCurrentIndex => indexed_retired_with(
            resolution.selected_binding().current_receipt(),
            resolution.selected_current_json_bytes(),
            LocalLogStorageTransactionId::try_new("transaction:wrong-prior-current-index")?,
        )?,
        _ => prior_current_retirement(&resolution)?,
    };
    let prior_predecessor = if matches!(corruption, SupersededCorruption::MissingPriorPredecessor) {
        None
    } else {
        prior_predecessor_retirement(&resolution)?
    };
    let observation = LocalLogStorageRotationResolutionObservation::candidate_immediate_predecessor(
        LocalLogStorageRotationSupersededObservation::new(
            current,
            candidate_index,
            current_index,
            candidate_checkpoint,
            prior_checkpoint,
            prior_current,
            prior_predecessor,
        ),
    );
    Ok((resolution, observation))
}

fn retired_exact_successor_case(
    fixture: &SelectedRotationFixture,
) -> TestResult<(LocalLogStorageRotationResolution, LocalLogStorageRotationResolutionObservation)> {
    let resolution = resolution(fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let candidate = candidate_selected(fixture, &resolution, false)?;
    let candidate_checkpoint_generation = candidate.binding().checkpoint_generation().clone();
    let successor =
        rotate_from_selected(&fixture.context, &candidate, "retired-successor", None, None)?;
    let candidate_active_generation = successor.binding().checkpoint_generation().clone();
    let successor_receipt = successor.current_receipt().clone();
    let successor_index = successor.transaction_id().clone();
    let current =
        rotate_from_selected(&fixture.context, &successor, "retired-current", None, None)?;
    let current_index = current.transaction_id().clone();
    let direct_successor = LocalLogStorageRotationDirectSuccessorObservation::exact(
        successor_receipt,
        successor_index,
    );
    let observation = LocalLogStorageRotationResolutionObservation::candidate_retired_identity(
        LocalLogStorageRotationRetiredObservation::new(
            candidate_retirement(&resolution)?,
            direct_successor,
            current,
            current_index,
            candidate_checkpoint_generation,
            candidate_active_generation,
            resolution.selected_binding().checkpoint_generation().clone(),
            prior_current_retirement(&resolution)?,
            prior_predecessor_retirement(&resolution)?,
        ),
    );
    Ok((resolution, observation))
}

#[derive(Clone, Copy)]
enum RetiredCorruption {
    CandidateLength,
    CandidateTombstoneIndex,
    SuccessorIndex,
    CurrentIndex,
    CandidateCheckpoint,
    CandidateActive,
    PriorCheckpoint,
    PriorCurrentLength,
    PriorCurrentIndex,
    MissingPriorPredecessor,
}

#[derive(Clone, Copy, Debug)]
enum HistoricalIdentityBranch {
    Competing,
    Superseded,
    Retired,
}

#[derive(Clone, Copy, Debug)]
enum HistoricalIdentityReuse {
    OldestExpectedHead,
    PredecessorSealedLog,
}

#[allow(clippy::too_many_lines)]
fn historical_identity_reuse_outcome(
    branch: HistoricalIdentityBranch,
    reuse: HistoricalIdentityReuse,
) -> TestResult<LocalLogStorageRotationResolutionOutcome> {
    let base = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let prior =
        rotate_from_selected(&base.context, &base.selected, "historical-plan-prior", None, None)?;
    assert_eq!(
        prior.predecessor_receipt().map(LocalLogStorageSelectionReceiptBinding::selection_kind),
        Some(LocalLogStorageSelectionKind::Rotation)
    );
    let predecessor_sealed_log = prior
        .predecessor_rotation_sealed_generation()
        .ok_or("deep prior omitted its byte-derived predecessor sealed generation")?
        .log_id()
        .clone();
    let candidate =
        rotate_from_selected(&base.context, &prior, "historical-plan-candidate", None, None)?;
    let resolution = resolution_for_normalized_candidate(&base.context, &prior, &candidate)?;
    let oldest_expected_head = resolution
        .selected_binding()
        .predecessor_receipt()
        .and_then(LocalLogStorageSelectionReceiptBinding::expected_head_id)
        .ok_or("deep plan omitted its oldest retained expected head")?
        .clone();
    let (successor_log_override, committed_head_override) = match reuse {
        HistoricalIdentityReuse::OldestExpectedHead => (None, Some(oldest_expected_head)),
        HistoricalIdentityReuse::PredecessorSealedLog => (Some(predecessor_sealed_log), None),
    };
    let identity = format!("historical-{branch:?}-{reuse:?}");

    let observation = match branch {
        HistoricalIdentityBranch::Competing => {
            let current = rotate_profile_observation_with_historical_reuse(
                &base.context,
                &prior,
                &identity,
                successor_log_override,
                committed_head_override,
            )?;
            let current_index = current.transaction_id().clone();
            LocalLogStorageRotationResolutionObservation::candidate_absent_different_current(
                LocalLogStorageRotationDifferentCurrentObservation::new(
                    current,
                    current_index,
                    resolution.selected_binding().checkpoint_generation().clone(),
                    prior_predecessor_retirement(&resolution)?,
                ),
            )
        }
        HistoricalIdentityBranch::Superseded => {
            let candidate_checkpoint = candidate.binding().checkpoint_generation().clone();
            let current = rotate_profile_observation_with_historical_reuse(
                &base.context,
                &candidate,
                &identity,
                successor_log_override,
                committed_head_override,
            )?;
            let current_index = current.transaction_id().clone();
            LocalLogStorageRotationResolutionObservation::candidate_immediate_predecessor(
                LocalLogStorageRotationSupersededObservation::new(
                    current,
                    resolution.candidate_receipt().transaction_id().clone(),
                    current_index,
                    candidate_checkpoint,
                    resolution.selected_binding().checkpoint_generation().clone(),
                    prior_current_retirement(&resolution)?,
                    prior_predecessor_retirement(&resolution)?,
                ),
            )
        }
        HistoricalIdentityBranch::Retired => {
            let candidate_checkpoint = candidate.binding().checkpoint_generation().clone();
            let successor = rotate_from_selected(
                &base.context,
                &candidate,
                "historical-retired-successor",
                None,
                None,
            )?;
            let candidate_active = successor.binding().checkpoint_generation().clone();
            let successor_receipt = successor.current_receipt().clone();
            let successor_index = successor.transaction_id().clone();
            let current = rotate_profile_observation_with_historical_reuse(
                &base.context,
                &successor,
                &identity,
                successor_log_override,
                committed_head_override,
            )?;
            let current_index = current.transaction_id().clone();
            LocalLogStorageRotationResolutionObservation::candidate_retired_identity(
                LocalLogStorageRotationRetiredObservation::new(
                    candidate_retirement(&resolution)?,
                    LocalLogStorageRotationDirectSuccessorObservation::exact(
                        successor_receipt,
                        successor_index,
                    ),
                    current,
                    current_index,
                    candidate_checkpoint,
                    candidate_active,
                    resolution.selected_binding().checkpoint_generation().clone(),
                    prior_current_retirement(&resolution)?,
                    prior_predecessor_retirement(&resolution)?,
                ),
            )
        }
    };
    complete(resolution, observation)
}

#[allow(clippy::too_many_lines)]
fn root_predecessor_checkpoint_reuse_outcome(
    branch: HistoricalIdentityBranch,
) -> TestResult<LocalLogStorageRotationResolutionOutcome> {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    assert_eq!(
        fixture
            .selected
            .predecessor_receipt()
            .map(LocalLogStorageSelectionReceiptBinding::selection_kind),
        Some(LocalLogStorageSelectionKind::Root)
    );
    let predecessor_checkpoint_log_id = fixture
        .selected
        .predecessor_checkpoint_log_id()
        .ok_or("rotation prior omitted its Root predecessor checkpoint identity")?
        .clone();
    assert_ne!(&predecessor_checkpoint_log_id, fixture.selected.checkpoint_log_id());
    assert_ne!(&predecessor_checkpoint_log_id, fixture.selected.active_log_id());

    let resolution = resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let candidate = candidate_selected(&fixture, &resolution, false)?;
    let identity = format!("root-predecessor-checkpoint-{branch:?}");

    let observation = match branch {
        HistoricalIdentityBranch::Competing => {
            let current = rotate_profile_observation_with_historical_reuse(
                &fixture.context,
                &fixture.selected,
                &identity,
                Some(predecessor_checkpoint_log_id.clone()),
                None,
            )?;
            assert_eq!(current.active_log_id(), &predecessor_checkpoint_log_id);
            let current_index = current.transaction_id().clone();
            LocalLogStorageRotationResolutionObservation::candidate_absent_different_current(
                LocalLogStorageRotationDifferentCurrentObservation::new(
                    current,
                    current_index,
                    resolution.selected_binding().checkpoint_generation().clone(),
                    prior_predecessor_retirement(&resolution)?,
                ),
            )
        }
        HistoricalIdentityBranch::Superseded => {
            let candidate_checkpoint = candidate.binding().checkpoint_generation().clone();
            let current = rotate_profile_observation_with_historical_reuse(
                &fixture.context,
                &candidate,
                &identity,
                Some(predecessor_checkpoint_log_id.clone()),
                None,
            )?;
            assert_eq!(current.active_log_id(), &predecessor_checkpoint_log_id);
            let current_index = current.transaction_id().clone();
            LocalLogStorageRotationResolutionObservation::candidate_immediate_predecessor(
                LocalLogStorageRotationSupersededObservation::new(
                    current,
                    resolution.candidate_receipt().transaction_id().clone(),
                    current_index,
                    candidate_checkpoint,
                    resolution.selected_binding().checkpoint_generation().clone(),
                    prior_current_retirement(&resolution)?,
                    prior_predecessor_retirement(&resolution)?,
                ),
            )
        }
        HistoricalIdentityBranch::Retired => {
            let candidate_checkpoint = candidate.binding().checkpoint_generation().clone();
            let successor = rotate_from_selected(
                &fixture.context,
                &candidate,
                "root-predecessor-checkpoint-retired-successor",
                None,
                None,
            )?;
            let candidate_active = successor.binding().checkpoint_generation().clone();
            let successor_receipt = successor.current_receipt().clone();
            let successor_index = successor.transaction_id().clone();
            let current = rotate_profile_observation_with_historical_reuse(
                &fixture.context,
                &successor,
                &identity,
                Some(predecessor_checkpoint_log_id.clone()),
                None,
            )?;
            assert_eq!(current.active_log_id(), &predecessor_checkpoint_log_id);
            let current_index = current.transaction_id().clone();
            LocalLogStorageRotationResolutionObservation::candidate_retired_identity(
                LocalLogStorageRotationRetiredObservation::new(
                    candidate_retirement(&resolution)?,
                    LocalLogStorageRotationDirectSuccessorObservation::exact(
                        successor_receipt,
                        successor_index,
                    ),
                    current,
                    current_index,
                    candidate_checkpoint,
                    candidate_active,
                    resolution.selected_binding().checkpoint_generation().clone(),
                    prior_current_retirement(&resolution)?,
                    prior_predecessor_retirement(&resolution)?,
                ),
            )
        }
    };
    complete(resolution, observation)
}

fn corrupted_retired_exact_successor_case(
    fixture: &SelectedRotationFixture,
    corruption: RetiredCorruption,
) -> TestResult<(LocalLogStorageRotationResolution, LocalLogStorageRotationResolutionObservation)> {
    let resolution = resolution(fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let candidate = candidate_selected(fixture, &resolution, false)?;
    let exact_candidate_checkpoint = candidate.binding().checkpoint_generation().clone();
    let successor = rotate_from_selected(
        &fixture.context,
        &candidate,
        "corrupted-retired-successor",
        None,
        None,
    )?;
    let exact_candidate_active = successor.binding().checkpoint_generation().clone();
    let successor_receipt = successor.current_receipt().clone();
    let exact_successor_index = successor.transaction_id().clone();
    let current = rotate_from_selected(
        &fixture.context,
        &successor,
        "corrupted-retired-current",
        None,
        None,
    )?;
    let exact_current_index = current.transaction_id().clone();
    let candidate_retirement = match corruption {
        RetiredCorruption::CandidateLength => indexed_retired(
            resolution.candidate_receipt(),
            resolution
                .candidate_json_bytes()
                .checked_add(1)
                .ok_or("test byte length overflowed")?,
        )?,
        RetiredCorruption::CandidateTombstoneIndex => indexed_retired_with(
            resolution.candidate_receipt(),
            resolution.candidate_json_bytes(),
            LocalLogStorageTransactionId::try_new("transaction:wrong-candidate-tombstone-index")?,
        )?,
        _ => candidate_retirement(&resolution)?,
    };
    let successor_index = if matches!(corruption, RetiredCorruption::SuccessorIndex) {
        resolution.candidate_receipt().transaction_id().clone()
    } else {
        exact_successor_index
    };
    let current_index = if matches!(corruption, RetiredCorruption::CurrentIndex) {
        LocalLogStorageTransactionId::try_new("transaction:wrong-retired-current-index")?
    } else {
        exact_current_index
    };
    let exact_prior_checkpoint = resolution.selected_binding().checkpoint_generation().clone();
    let candidate_checkpoint = if matches!(corruption, RetiredCorruption::CandidateCheckpoint) {
        exact_prior_checkpoint.clone()
    } else {
        exact_candidate_checkpoint.clone()
    };
    let candidate_active = if matches!(corruption, RetiredCorruption::CandidateActive) {
        exact_candidate_checkpoint.clone()
    } else {
        exact_candidate_active
    };
    let prior_checkpoint = if matches!(corruption, RetiredCorruption::PriorCheckpoint) {
        exact_candidate_checkpoint
    } else {
        exact_prior_checkpoint
    };
    let prior_current = match corruption {
        RetiredCorruption::PriorCurrentLength => indexed_retired(
            resolution.selected_binding().current_receipt(),
            resolution
                .selected_current_json_bytes()
                .checked_add(1)
                .ok_or("test byte length overflowed")?,
        )?,
        RetiredCorruption::PriorCurrentIndex => indexed_retired_with(
            resolution.selected_binding().current_receipt(),
            resolution.selected_current_json_bytes(),
            LocalLogStorageTransactionId::try_new("transaction:wrong-prior-current-index")?,
        )?,
        _ => prior_current_retirement(&resolution)?,
    };
    let prior_predecessor = if matches!(corruption, RetiredCorruption::MissingPriorPredecessor) {
        None
    } else {
        prior_predecessor_retirement(&resolution)?
    };
    let observation = LocalLogStorageRotationResolutionObservation::candidate_retired_identity(
        LocalLogStorageRotationRetiredObservation::new(
            candidate_retirement,
            LocalLogStorageRotationDirectSuccessorObservation::exact(
                successor_receipt,
                successor_index,
            ),
            current,
            current_index,
            candidate_checkpoint,
            candidate_active,
            prior_checkpoint,
            prior_current,
            prior_predecessor,
        ),
    );
    Ok((resolution, observation))
}

fn receipt_in_scope_incarnation(
    receipt: &LocalLogStorageSelectionReceiptBinding,
    scope_incarnation_id: &LocalLogStorageScopeIncarnationId,
) -> TestResult<LocalLogStorageSelectionReceiptBinding> {
    Ok(LocalLogStorageSelectionReceiptBinding::try_new(
        receipt.profile_id().clone(),
        receipt.profile_version(),
        receipt.database_incarnation_id().clone(),
        receipt.scope_id().clone(),
        scope_incarnation_id.clone(),
        receipt.transaction_id().clone(),
        receipt.expected_head_id().cloned(),
        receipt.committed_head_id().clone(),
        receipt.selection_kind(),
        receipt.session_id().clone(),
    )?)
}

fn selected_in_scope_incarnation(
    fixture: &SelectedRotationFixture,
    scope_incarnation_id: &LocalLogStorageScopeIncarnationId,
) -> TestResult<LocalLogStorageSelectedRoot> {
    selected_value_in_scope_incarnation(&fixture.context, &fixture.selected, scope_incarnation_id)
}

fn selected_value_in_scope_incarnation(
    context: &crate::state::EditorContext,
    selected: &LocalLogStorageSelectedRoot,
    scope_incarnation_id: &LocalLogStorageScopeIncarnationId,
) -> TestResult<LocalLogStorageSelectedRoot> {
    let (binding, current_json, predecessor_json) = selected.snapshot_attempt_envelope();
    let current_receipt =
        receipt_in_scope_incarnation(binding.current_receipt(), scope_incarnation_id)?;
    let predecessor_receipt = binding
        .predecessor_receipt()
        .map(|receipt| receipt_in_scope_incarnation(receipt, scope_incarnation_id))
        .transpose()?;
    let changed = LocalLogStorageSelectedBinding::try_new(
        current_receipt,
        predecessor_receipt,
        binding.checkpoint_generation().clone(),
        binding.active_generation().clone(),
    )?;
    let codec = LocalLogStorageSelectedJsonCodec::new(context.clone(), changed);
    match (selected.selection_kind(), predecessor_json.as_deref()) {
        (LocalLogStorageSelectionKind::Root, None) => Ok(codec.normalize_root(&current_json)?),
        (LocalLogStorageSelectionKind::Rotation, Some(predecessor_json)) => {
            Ok(codec.normalize_rotation(&current_json, predecessor_json)?)
        }
        _ => Err("fixture selected envelope has an inconsistent shape".into()),
    }
}

fn current_with_predecessor_expected_head(
    context: &crate::state::EditorContext,
    current: &LocalLogStorageSelectedRoot,
    expected_head_id: LocalLogStorageHeadId,
) -> TestResult<LocalLogStorageSelectedRoot> {
    let (binding, current_json, predecessor_json) = current.snapshot_attempt_envelope();
    let predecessor_json = predecessor_json.ok_or("current rotation omitted its predecessor")?;
    let predecessor_receipt =
        binding.predecessor_receipt().ok_or("current rotation omitted its predecessor receipt")?;
    let original_expected_head_id =
        predecessor_receipt.expected_head_id().ok_or("visible predecessor was not a rotation")?;
    assert_ne!(original_expected_head_id, &expected_head_id);
    let predecessor_codec = LocalLogStorageGenerationJsonCodec::new(
        context.clone(),
        LocalLogStorageGenerationBinding::try_new(
            predecessor_receipt.profile_id().clone(),
            predecessor_receipt.profile_version(),
            predecessor_receipt.scope_id().clone(),
            original_expected_head_id.clone(),
            predecessor_receipt.committed_head_id().clone(),
        )?,
    );
    let predecessor = predecessor_codec.decode_bound_rotation(&predecessor_json)?;
    let altered_predecessor =
        LocalLogStorageGenerationManifest::from_parts(LocalLogStorageGenerationManifestParts {
            profile_id: predecessor.profile_id().clone(),
            profile_version: predecessor.profile_version(),
            scope_id: predecessor.scope_id().clone(),
            transaction_id: predecessor.transaction_id().clone(),
            expected_head_id: expected_head_id.clone(),
            committed_head_id: predecessor.committed_head_id().clone(),
            fence_id: predecessor.fence_id().clone(),
            session_id: predecessor.session_id().clone(),
            sealed_log_id: predecessor.sealed_log_id().clone(),
            successor_log_id: predecessor.successor_log_id().clone(),
            accepted_prefix_bytes: predecessor.accepted_prefix_bytes(),
            sealed_frame: predecessor.sealed_frame(),
            successor_frame: predecessor.successor_frame(),
            checkpoint_json: predecessor.checkpoint_json().to_owned(),
        });
    let altered_predecessor_json = serde_json::to_string(&manifest_record(&altered_predecessor))?;
    let altered_predecessor_receipt = LocalLogStorageSelectionReceiptBinding::try_new(
        predecessor_receipt.profile_id().clone(),
        predecessor_receipt.profile_version(),
        predecessor_receipt.database_incarnation_id().clone(),
        predecessor_receipt.scope_id().clone(),
        predecessor_receipt.scope_incarnation_id().clone(),
        predecessor_receipt.transaction_id().clone(),
        Some(expected_head_id),
        predecessor_receipt.committed_head_id().clone(),
        LocalLogStorageSelectionKind::Rotation,
        predecessor_receipt.session_id().clone(),
    )?;
    let altered_binding = LocalLogStorageSelectedBinding::try_new(
        binding.current_receipt().clone(),
        Some(altered_predecessor_receipt),
        binding.checkpoint_generation().clone(),
        binding.active_generation().clone(),
    )?;
    Ok(LocalLogStorageSelectedJsonCodec::new(context.clone(), altered_binding)
        .normalize_rotation(&current_json, &altered_predecessor_json)?)
}

fn retired_successor_tombstone_case(
    fixture: &SelectedRotationFixture,
    visible_predecessor_expected_head: Option<LocalLogStorageHeadId>,
) -> TestResult<(LocalLogStorageRotationResolution, LocalLogStorageRotationResolutionObservation)> {
    let resolution = resolution(fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let candidate = candidate_selected(fixture, &resolution, false)?;
    let candidate_checkpoint = candidate.binding().checkpoint_generation().clone();
    let successor = rotate_from_selected(
        &fixture.context,
        &candidate,
        "retired-tombstone-successor",
        None,
        None,
    )?;
    let candidate_active = successor.binding().checkpoint_generation().clone();
    let successor_head = successor.selected_head_id().clone();
    let successor_retirement =
        indexed_retired(successor.current_receipt(), successor.current_selection_json_bytes())?;
    let later =
        rotate_from_selected(&fixture.context, &successor, "retired-tombstone-later", None, None)?;
    let current =
        rotate_from_selected(&fixture.context, &later, "retired-tombstone-current", None, None)?;
    let current = if let Some(expected_head_id) = visible_predecessor_expected_head {
        let altered = current_with_predecessor_expected_head(
            &fixture.context,
            &current,
            expected_head_id.clone(),
        )?;
        assert_eq!(
            altered.predecessor_receipt().and_then(|receipt| receipt.expected_head_id()),
            Some(&expected_head_id)
        );
        altered
    } else {
        assert_eq!(
            current.predecessor_receipt().and_then(|receipt| receipt.expected_head_id()),
            Some(&successor_head)
        );
        current
    };
    let current_index = current.transaction_id().clone();
    let observation = LocalLogStorageRotationResolutionObservation::candidate_retired_identity(
        LocalLogStorageRotationRetiredObservation::new(
            candidate_retirement(&resolution)?,
            LocalLogStorageRotationDirectSuccessorObservation::retired(successor_retirement),
            current,
            current_index,
            candidate_checkpoint,
            candidate_active,
            resolution.selected_binding().checkpoint_generation().clone(),
            prior_current_retirement(&resolution)?,
            prior_predecessor_retirement(&resolution)?,
        ),
    );
    Ok((resolution, observation))
}

fn predecessor_root_uncertain(
    fixture: &SelectedRotationFixture,
) -> TestResult<LocalLogStorageUncertainAttempt> {
    let receipt = fixture
        .selected
        .predecessor_receipt()
        .ok_or("selected rotation omitted its root predecessor")?;
    let predecessor_json = fixture
        .selected
        .predecessor_selection_json()
        .ok_or("selected rotation omitted its exact predecessor JSON")?;
    let codec = LocalLogStorageRootJsonCodec::new(
        fixture.context.clone(),
        LocalLogStorageRootBinding::new(
            receipt.profile_id().clone(),
            receipt.profile_version(),
            receipt.scope_id().clone(),
            receipt.committed_head_id().clone(),
        ),
    );
    let selection = codec.decode_root(predecessor_json)?;
    Ok(codec
        .prepare_root_attempt(
            receipt.database_incarnation_id(),
            receipt.scope_incarnation_id(),
            &selection,
        )?
        .begin_attempt())
}

#[test]
fn four_source_states_begin_rotation_and_root_rejection_recovers_owner() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    for source in [
        LocalLogStorageRotationResolutionSourceKind::Uncertain,
        LocalLogStorageRotationResolutionSourceKind::AttemptAborted,
        LocalLogStorageRotationResolutionSourceKind::NotAttempted,
        LocalLogStorageRotationResolutionSourceKind::HostAttestedCommitted,
    ] {
        let resolution = resolution(&fixture, source)?;
        assert_eq!(resolution.source_kind(), source);
        assert_eq!(resolution.selection_kind(), LocalLogStorageSelectionKind::Rotation);
        assert!(!resolution.request_issued());
        assert_eq!(
            resolution.candidate_receipt().expected_head_id(),
            Some(fixture.selected.selected_head_id())
        );
        assert_eq!(resolution.selected_binding(), fixture.selected.binding());
    }

    let rotation_fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let root_owner = predecessor_root_uncertain(&rotation_fixture)?;
    let attempt_id = root_owner.attempt_id().clone();
    let binding = root_owner.candidate_binding().clone();
    let candidate_json_bytes = root_owner.candidate_json_bytes();
    let Err(failure) = root_owner.try_begin_rotation_resolution() else {
        return Err("rotation-only resolution accepted a root plan".into());
    };
    assert_eq!(
        failure.error(),
        &LocalLogStorageRotationResolutionStartError::SelectionKindMismatch {
            actual: LocalLogStorageSelectionKind::Root,
        }
    );
    assert_eq!(failure.owner().attempt_id(), &attempt_id);
    assert_eq!(failure.owner().candidate_binding(), &binding);
    assert_eq!(failure.owner().candidate_json_bytes(), candidate_json_bytes);
    let recovered = failure.into_owner();
    assert_eq!(recovered.attempt_id(), &attempt_id);
    assert_eq!(recovered.candidate_binding(), &binding);
    Ok(())
}

#[test]
fn adapter_request_is_one_shot_and_preserves_all_exact_rotation_payloads() -> TestResult {
    for prior_kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(prior_kind)?;
        let expected_candidate_json = candidate_json(&fixture)?;
        let mut resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let expected_candidate_binding = resolution.candidate_binding().clone();
        let expected_selected_binding = resolution.selected_binding().clone();
        {
            let request = resolution.adapter_request()?;
            assert_eq!(request.candidate_json(), expected_candidate_json);
            assert_eq!(request.candidate_json_bytes(), expected_candidate_json.len());
            assert_eq!(request.candidate_binding(), &expected_candidate_binding);
            assert_eq!(request.selected_binding(), &expected_selected_binding);
            assert_eq!(request.selected_current_json(), fixture.selected.current_selection_json());
            assert_eq!(
                request.selected_predecessor_json(),
                fixture.selected.predecessor_selection_json()
            );
        }
        assert!(matches!(
            resolution.adapter_request(),
            Err(LocalLogStorageRotationResolutionTransitionError::RequestAlreadyIssued)
        ));
    }
    Ok(())
}

#[test]
fn pre_egress_and_cross_request_evidence_retain_both_owners() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let pre_egress_resolution =
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let source_attempt_id = pre_egress_resolution.source_attempt_id().clone();
    let candidate_binding = pre_egress_resolution.candidate_binding().clone();
    let mut token_source =
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let foreign_request_id = token_source.adapter_request()?.request_id().clone();
    let evidence = LocalLogStorageRotationResolutionEvidence::transaction_completed(
        &foreign_request_id,
        LocalLogStorageRotationResolutionObservation::expected_scope_absent(),
    );
    let Err(failure) = pre_egress_resolution.apply_resolution_evidence(evidence) else {
        return Err("pre-egress evidence was accepted".into());
    };
    assert_eq!(
        failure.error(),
        &LocalLogStorageRotationResolutionTransitionError::RequestNotIssued
    );
    assert_eq!(failure.resolution().source_attempt_id(), &source_attempt_id);
    assert_eq!(failure.resolution().candidate_binding(), &candidate_binding);
    assert_eq!(failure.evidence().request_id(), &foreign_request_id);

    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let mut first = resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let mut second = resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let first_request_id = first.adapter_request()?.request_id().clone();
    let second_request_id = second.adapter_request()?.request_id().clone();
    assert_ne!(first_request_id, second_request_id);
    let evidence = LocalLogStorageRotationResolutionEvidence::transaction_completed(
        &second_request_id,
        prior_still_selected_observation(fixture),
    );
    let Err(failure) = first.apply_resolution_evidence(evidence) else {
        return Err("cross-request evidence was accepted".into());
    };
    assert_eq!(
        failure.error(),
        &LocalLogStorageRotationResolutionTransitionError::RequestIdMismatch
    );
    assert_eq!(failure.evidence().request_id(), &second_request_id);
    let (_first, evidence, error) = failure.into_parts();
    assert_eq!(error, LocalLogStorageRotationResolutionTransitionError::RequestIdMismatch);
    let outcome = second
        .apply_resolution_evidence(evidence)
        .map_err(|failure| format!("recovered evidence rejected by its owner: {failure:?}"))?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRotationResolutionOutcomeKind::RetryEligibleAtResolution
    );
    Ok(())
}

#[test]
fn restart_preserves_exact_plan_and_invalidates_stale_completion() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let mut resolution =
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let attempt_id = resolution.source_attempt_id().clone();
    let candidate_binding = resolution.candidate_binding().clone();
    let selected_binding = resolution.selected_binding().clone();
    let (old_request_id, candidate_pointer, exact_json) = {
        let request = resolution.adapter_request()?;
        (
            request.request_id().clone(),
            request.candidate_json().as_ptr(),
            request.candidate_json().to_owned(),
        )
    };
    let stale = LocalLogStorageRotationResolutionEvidence::transaction_completed(
        &old_request_id,
        LocalLogStorageRotationResolutionObservation::expected_scope_absent(),
    );
    let mut restarted = resolution.restart_resolution();
    assert_eq!(restarted.source_attempt_id(), &attempt_id);
    assert_eq!(restarted.candidate_binding(), &candidate_binding);
    assert_eq!(restarted.selected_binding(), &selected_binding);
    assert!(!restarted.request_issued());
    let new_request_id = {
        let request = restarted.adapter_request()?;
        assert_eq!(request.candidate_json(), exact_json);
        assert_eq!(request.candidate_json().as_ptr(), candidate_pointer);
        request.request_id().clone()
    };
    assert_ne!(new_request_id, old_request_id);
    let Err(failure) = restarted.apply_resolution_evidence(stale) else {
        return Err("stale pre-restart completion was accepted".into());
    };
    assert_eq!(
        failure.error(),
        &LocalLogStorageRotationResolutionTransitionError::RequestIdMismatch
    );
    let (restarted, stale, _) = failure.into_parts();
    assert_eq!(stale.request_id(), &old_request_id);
    let fresh = LocalLogStorageRotationResolutionEvidence::transaction_completed(
        &new_request_id,
        LocalLogStorageRotationResolutionObservation::expected_scope_absent(),
    );
    let outcome = restarted
        .apply_resolution_evidence(fresh)
        .map_err(|failure| format!("fresh post-restart completion rejected: {failure:?}"))?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRotationResolutionOutcomeKind::StorageResetOrIndeterminate
    );
    Ok(())
}

#[test]
fn prior_still_selected_has_the_complete_source_outcome_lattice() -> TestResult {
    for source in [
        LocalLogStorageRotationResolutionSourceKind::Uncertain,
        LocalLogStorageRotationResolutionSourceKind::AttemptAborted,
        LocalLogStorageRotationResolutionSourceKind::NotAttempted,
    ] {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let resolution = resolution(&fixture, source)?;
        let attempt_id = resolution.source_attempt_id().clone();
        let outcome = complete(resolution, prior_still_selected_observation(fixture))?;
        let LocalLogStorageRotationResolutionOutcome::RetryEligibleAtResolution(retry) = outcome
        else {
            return Err(format!("{source:?} clean prior state was not retry eligible").into());
        };
        assert_eq!(retry.source_kind(), source);
        assert_eq!(retry.source_attempt_id(), &attempt_id);
    }

    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let resolution =
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::HostAttestedCommitted)?;
    let outcome = complete(resolution, prior_still_selected_observation(fixture))?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRotationResolutionCollisionReason::HostAttestedCandidateMissing
    );
    Ok(())
}

#[test]
fn direct_competing_rotation_has_the_complete_source_outcome_lattice() -> TestResult {
    for source in [
        LocalLogStorageRotationResolutionSourceKind::Uncertain,
        LocalLogStorageRotationResolutionSourceKind::AttemptAborted,
        LocalLogStorageRotationResolutionSourceKind::NotAttempted,
    ] {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let resolution = resolution(&fixture, source)?;
        let observation = different_current_observation(
            &fixture,
            &resolution,
            &format!("direct-conflict-{source:?}"),
        )?;
        let outcome = complete(resolution, observation)?;
        assert_eq!(
            outcome.kind(),
            LocalLogStorageRotationResolutionOutcomeKind::DefinitelyNotCommittedConflict
        );
    }

    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let resolution =
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::HostAttestedCommitted)?;
    let observation =
        different_current_observation(&fixture, &resolution, "direct-conflict-host-attested")?;
    let outcome = complete(resolution, observation)?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRotationResolutionCollisionReason::HostAttestedCandidateMissing
    );
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn database_and_scope_lifetime_findings_fail_closed_with_exact_id_precedence() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let mut physical =
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let request_id = physical.adapter_request()?.request_id().clone();
    let outcome = physical
        .apply_resolution_evidence(LocalLogStorageRotationResolutionEvidence::database_open_absent(
            &request_id,
        ))
        .map_err(|failure| format!("database-open absence was rejected: {failure:?}"))?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRotationResolutionOutcomeKind::StorageResetOrIndeterminate
    );

    let outcome = complete(
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?,
        LocalLogStorageRotationResolutionObservation::empty_database_without_profile_record(),
    )?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRotationResolutionOutcomeKind::StorageResetOrIndeterminate
    );

    let outcome = complete(
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?,
        LocalLogStorageRotationResolutionObservation::expected_database_incarnation_mismatch(
            LocalLogStorageDatabaseIncarnationId::try_new(OTHER_DATABASE_INCARNATION)?,
        ),
    )?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRotationResolutionOutcomeKind::StorageResetOrIndeterminate
    );

    let exact_database = fixture.selected.database_incarnation_id().clone();
    let outcome = complete(
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?,
        LocalLogStorageRotationResolutionObservation::expected_database_incarnation_mismatch(
            exact_database,
        ),
    )?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRotationResolutionCollisionReason::ExpectedDatabaseObservationMismatch
    );

    let outcome = complete(
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?,
        LocalLogStorageRotationResolutionObservation::expected_scope_absent(),
    )?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRotationResolutionOutcomeKind::StorageResetOrIndeterminate
    );

    let other_scope_resolution =
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let same_scalar_candidate = candidate_selected(&fixture, &other_scope_resolution, false)?;
    let other_scope = selected_value_in_scope_incarnation(
        &fixture.context,
        &same_scalar_candidate,
        &LocalLogStorageScopeIncarnationId::try_new(OTHER_SCOPE_INCARNATION)?,
    )?;
    assert_eq!(
        other_scope.transaction_id(),
        other_scope_resolution.candidate_receipt().transaction_id()
    );
    assert_eq!(
        other_scope.selected_head_id(),
        other_scope_resolution.candidate_receipt().committed_head_id()
    );
    let other_scope_index = other_scope.transaction_id().clone();
    let outcome = complete(
        other_scope_resolution,
        LocalLogStorageRotationResolutionObservation::expected_scope_incarnation_mismatch(
            LocalLogStorageRotationOtherScopeObservation::new(other_scope, other_scope_index),
        ),
    )?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRotationResolutionOutcomeKind::StorageResetOrIndeterminate
    );

    let exact_scope =
        selected_in_scope_incarnation(&fixture, fixture.selected.scope_incarnation_id())?;
    let exact_scope_index = exact_scope.transaction_id().clone();
    let outcome = complete(
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?,
        LocalLogStorageRotationResolutionObservation::expected_scope_incarnation_mismatch(
            LocalLogStorageRotationOtherScopeObservation::new(exact_scope, exact_scope_index),
        ),
    )?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRotationResolutionCollisionReason::ExpectedScopeObservationMismatch
    );

    let outcome = complete(
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?,
        LocalLogStorageRotationResolutionObservation::broken_profile_association(
            LocalLogStorageRotationResolutionBrokenAssociation::ProfileMetadata,
        ),
    )?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRotationResolutionCollisionReason::ObservedBrokenProfileAssociation {
            association: LocalLogStorageRotationResolutionBrokenAssociation::ProfileMetadata,
        }
    );
    Ok(())
}

#[test]
fn candidate_selected_is_positive_for_root_and_rotation_prior_envelopes() -> TestResult {
    for prior_kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(prior_kind)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let source_attempt_id = resolution.source_attempt_id().clone();
        let candidate_binding = resolution.candidate_binding().clone();
        let observation = selected_observation(&fixture, &resolution, false)?;
        let outcome = complete(resolution, observation)?;
        let LocalLogStorageRotationResolutionOutcome::CommittedSelectedAtResolution(resolved) =
            outcome
        else {
            return Err(format!("candidate with {prior_kind:?} prior was not selected").into());
        };
        assert_eq!(resolved.source_attempt_id(), &source_attempt_id);
        assert_eq!(resolved.candidate_binding(), &candidate_binding);
        assert_eq!(
            resolved.observation_kind(),
            LocalLogStorageRotationResolutionObservationKind::CandidateSelected
        );
        assert_eq!(resolved.collision_reason(), None);
    }
    Ok(())
}

#[test]
fn superseded_is_positive_for_root_and_rotation_prior_envelopes() -> TestResult {
    for prior_kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(prior_kind)?;
        let (resolution, observation) = superseded_case(
            &fixture,
            LocalLogStorageRotationResolutionSourceKind::HostAttestedCommitted,
        )?;
        let outcome = complete(resolution, observation)?;
        assert_eq!(
            outcome.kind(),
            LocalLogStorageRotationResolutionOutcomeKind::CommittedSuperseded
        );
    }
    Ok(())
}

#[test]
fn retired_candidate_with_exact_successor_is_positive() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let (resolution, observation) = retired_exact_successor_case(&fixture)?;
    let outcome = complete(resolution, observation)?;
    let LocalLogStorageRotationResolutionOutcome::ResolutionRetired(resolved) = outcome else {
        return Err("valid retired candidate was not classified as retired".into());
    };
    assert_eq!(
        resolved.observation_kind(),
        LocalLogStorageRotationResolutionObservationKind::CandidateRetiredIdentity
    );
    assert_eq!(resolved.collision_reason(), None);
    Ok(())
}

#[test]
fn retired_successor_tombstone_allows_its_head_but_rejects_older_expected_head_reuse() -> TestResult
{
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let (positive_resolution, observation) = retired_successor_tombstone_case(&fixture, None)?;
    assert_eq!(
        complete(positive_resolution, observation)?.kind(),
        LocalLogStorageRotationResolutionOutcomeKind::ResolutionRetired
    );

    let probe = resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let forbidden_heads = [
        probe.candidate_receipt().committed_head_id().clone(),
        probe.selected_binding().current_receipt().committed_head_id().clone(),
        probe
            .selected_binding()
            .current_receipt()
            .expected_head_id()
            .ok_or("rotation prior omitted its expected head")?
            .clone(),
    ];
    for forbidden_head in forbidden_heads {
        let (resolution, observation) =
            retired_successor_tombstone_case(&fixture, Some(forbidden_head))?;
        let reason = collision_reason(complete(resolution, observation)?)?;
        assert_eq!(
            reason,
            LocalLogStorageRotationResolutionCollisionReason::CurrentIdentityReuse,
            "visible predecessor expected-head reuse returned the wrong collision reason"
        );
    }
    Ok(())
}

#[test]
fn exact_retry_preserves_allocations_and_uses_a_fresh_attempt_identity() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let mut resolution =
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let original_attempt_id = resolution.source_attempt_id().clone();
    let candidate_binding = resolution.candidate_binding().clone();
    let selected_binding = resolution.selected_binding().clone();
    let (request_id, candidate_pointer, exact_candidate_json) = {
        let request = resolution.adapter_request()?;
        (
            request.request_id().clone(),
            request.candidate_json().as_ptr(),
            request.candidate_json().to_owned(),
        )
    };
    let evidence = LocalLogStorageRotationResolutionEvidence::transaction_completed(
        &request_id,
        prior_still_selected_observation(fixture),
    );
    let outcome = resolution
        .apply_resolution_evidence(evidence)
        .map_err(|failure| format!("clean prior observation rejected: {failure:?}"))?;
    let LocalLogStorageRotationResolutionOutcome::RetryEligibleAtResolution(retry) = outcome else {
        return Err("clean prior observation was not retry eligible".into());
    };
    assert_eq!(retry.candidate_binding(), &candidate_binding);
    assert_eq!(retry.selected_binding(), &selected_binding);
    assert_eq!(retry.candidate_json_bytes(), exact_candidate_json.len());
    let mut resubmitted = retry.begin_exact_resubmission();
    assert_ne!(resubmitted.attempt_id(), &original_attempt_id);
    assert_eq!(resubmitted.candidate_binding(), &candidate_binding);
    let request = resubmitted.adapter_request()?;
    assert_eq!(request.candidate_json(), exact_candidate_json);
    assert_eq!(request.candidate_json().as_ptr(), candidate_pointer);
    assert_eq!(request.candidate_binding(), &candidate_binding);
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn prior_and_selected_branches_check_bytes_indexes_checkpoints_and_tombstones() -> TestResult {
    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let wrong_index = LocalLogStorageTransactionId::try_new("transaction:wrong-current-index")?;
        let observation =
            LocalLogStorageRotationResolutionObservation::candidate_absent_prior_still_selected(
                LocalLogStorageRotationPriorStillSelectedObservation::new(
                    fixture.selected,
                    wrong_index,
                ),
            );
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::CurrentCommittedHeadIndexMismatch
        );
    }

    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let altered = prior_selected_with_altered_payload(&fixture)?;
        let index = altered.transaction_id().clone();
        let observation =
            LocalLogStorageRotationResolutionObservation::candidate_absent_prior_still_selected(
                LocalLogStorageRotationPriorStillSelectedObservation::new(altered, index),
            );
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::PriorSelectionMismatch
        );
    }

    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let observation = selected_observation(&fixture, &resolution, true)?;
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::CandidateSelectedMismatch
        );
    }

    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let selected = candidate_selected(&fixture, &resolution, false)?;
        let observation = LocalLogStorageRotationResolutionObservation::candidate_selected(
            LocalLogStorageRotationSelectedObservation::new(
                selected,
                LocalLogStorageTransactionId::try_new("transaction:wrong-candidate-index")?,
                resolution.selected_binding().checkpoint_generation().clone(),
                None,
            ),
        );
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::CandidateCommittedHeadIndexMismatch
        );
    }

    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let selected = candidate_selected(&fixture, &resolution, false)?;
        let wrong_checkpoint = selected.binding().checkpoint_generation().clone();
        let observation = LocalLogStorageRotationResolutionObservation::candidate_selected(
            LocalLogStorageRotationSelectedObservation::new(
                selected,
                resolution.candidate_receipt().transaction_id().clone(),
                wrong_checkpoint,
                None,
            ),
        );
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::PriorCheckpointGenerationMismatch
        );
    }

    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let selected = candidate_selected(&fixture, &resolution, false)?;
        let observation = LocalLogStorageRotationResolutionObservation::candidate_selected(
            LocalLogStorageRotationSelectedObservation::new(
                selected,
                resolution.candidate_receipt().transaction_id().clone(),
                resolution.selected_binding().checkpoint_generation().clone(),
                None,
            ),
        );
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch
        );
    }

    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let selected = candidate_selected(&fixture, &resolution, false)?;
        let unexpected = prior_current_retirement(&resolution)?;
        let observation = LocalLogStorageRotationResolutionObservation::candidate_selected(
            LocalLogStorageRotationSelectedObservation::new(
                selected,
                resolution.candidate_receipt().transaction_id().clone(),
                resolution.selected_binding().checkpoint_generation().clone(),
                Some(unexpected),
            ),
        );
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch
        );
    }
    Ok(())
}

#[test]
fn different_current_checks_direct_edge_index_and_candidate_identity_reuse() -> TestResult {
    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let selected = rotate_from_selected(
            &fixture.context,
            &fixture.selected,
            "wrong-conflict-index",
            None,
            None,
        )?;
        let observation =
            LocalLogStorageRotationResolutionObservation::candidate_absent_different_current(
                LocalLogStorageRotationDifferentCurrentObservation::new(
                    selected,
                    LocalLogStorageTransactionId::try_new("transaction:wrong-conflict-index")?,
                    resolution.selected_binding().checkpoint_generation().clone(),
                    prior_predecessor_retirement(&resolution)?,
                ),
            );
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::CurrentCommittedHeadIndexMismatch
        );
    }

    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let direct = rotate_from_selected(
            &fixture.context,
            &fixture.selected,
            "far-conflict-direct",
            None,
            None,
        )?;
        let far =
            rotate_from_selected(&fixture.context, &direct, "far-conflict-current", None, None)?;
        let current_index = far.transaction_id().clone();
        let observation =
            LocalLogStorageRotationResolutionObservation::candidate_absent_different_current(
                LocalLogStorageRotationDifferentCurrentObservation::new(
                    far,
                    current_index,
                    resolution.selected_binding().checkpoint_generation().clone(),
                    prior_predecessor_retirement(&resolution)?,
                ),
            );
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::DifferentCurrentMismatch
        );
    }

    {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let resolution =
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
        let reused_candidate_active =
            resolution.candidate_binding().active_generation().log_id().clone();
        let selected = rotate_from_selected(
            &fixture.context,
            &fixture.selected,
            "conflict-reuses-candidate-active",
            Some(reused_candidate_active),
            None,
        )?;
        let current_index = selected.transaction_id().clone();
        let observation =
            LocalLogStorageRotationResolutionObservation::candidate_absent_different_current(
                LocalLogStorageRotationDifferentCurrentObservation::new(
                    selected,
                    current_index,
                    resolution.selected_binding().checkpoint_generation().clone(),
                    prior_predecessor_retirement(&resolution)?,
                ),
            );
        assert_eq!(
            collision_reason(complete(resolution, observation)?)?,
            LocalLogStorageRotationResolutionCollisionReason::CurrentIdentityReuse
        );
    }
    Ok(())
}

#[test]
fn every_later_current_shape_rejects_the_oldest_head_and_byte_derived_sealed_log() -> TestResult {
    for branch in [
        HistoricalIdentityBranch::Competing,
        HistoricalIdentityBranch::Superseded,
        HistoricalIdentityBranch::Retired,
    ] {
        for reuse in [
            HistoricalIdentityReuse::OldestExpectedHead,
            HistoricalIdentityReuse::PredecessorSealedLog,
        ] {
            assert_eq!(
                collision_reason(historical_identity_reuse_outcome(branch, reuse)?)?,
                LocalLogStorageRotationResolutionCollisionReason::CurrentIdentityReuse,
                "{branch:?} failed to reject {reuse:?} reuse"
            );
        }
    }
    Ok(())
}

#[test]
fn every_current_shape_rejects_the_root_predecessor_checkpoint_log() -> TestResult {
    for branch in [
        HistoricalIdentityBranch::Competing,
        HistoricalIdentityBranch::Superseded,
        HistoricalIdentityBranch::Retired,
    ] {
        assert_eq!(
            collision_reason(root_predecessor_checkpoint_reuse_outcome(branch)?)?,
            LocalLogStorageRotationResolutionCollisionReason::CurrentIdentityReuse,
            "{branch:?} failed to reject the Root predecessor checkpoint-log reuse"
        );
    }
    Ok(())
}

#[test]
fn superseded_branch_checks_every_independently_supplied_fact() -> TestResult {
    let cases = [
        (
            SupersededCorruption::CandidateIndex,
            LocalLogStorageRotationResolutionCollisionReason::CandidateCommittedHeadIndexMismatch,
        ),
        (
            SupersededCorruption::CurrentIndex,
            LocalLogStorageRotationResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
        ),
        (
            SupersededCorruption::CandidateBytes,
            LocalLogStorageRotationResolutionCollisionReason::CandidateImmediatePredecessorMismatch,
        ),
        (
            SupersededCorruption::CandidateCheckpoint,
            LocalLogStorageRotationResolutionCollisionReason::CandidateCheckpointGenerationMismatch,
        ),
        (
            SupersededCorruption::PriorCheckpoint,
            LocalLogStorageRotationResolutionCollisionReason::PriorCheckpointGenerationMismatch,
        ),
        (
            SupersededCorruption::PriorCurrentLength,
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
        ),
        (
            SupersededCorruption::PriorCurrentIndex,
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
        ),
        (
            SupersededCorruption::MissingPriorPredecessor,
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
        ),
    ];
    for (corruption, expected) in cases {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let (resolution, observation) = corrupted_superseded_case(&fixture, corruption)?;
        assert_eq!(collision_reason(complete(resolution, observation)?)?, expected);
    }
    Ok(())
}

#[test]
fn retired_branch_checks_lengths_indexes_successor_and_generation_history() -> TestResult {
    let cases = [
        (
            RetiredCorruption::CandidateLength,
            LocalLogStorageRotationResolutionCollisionReason::RetiredTransactionMismatch,
        ),
        (
            RetiredCorruption::CandidateTombstoneIndex,
            LocalLogStorageRotationResolutionCollisionReason::RetiredTransactionMismatch,
        ),
        (
            RetiredCorruption::SuccessorIndex,
            LocalLogStorageRotationResolutionCollisionReason::RetiredSuccessorMismatch,
        ),
        (
            RetiredCorruption::CurrentIndex,
            LocalLogStorageRotationResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
        ),
        (
            RetiredCorruption::CandidateCheckpoint,
            LocalLogStorageRotationResolutionCollisionReason::CandidateCheckpointGenerationMismatch,
        ),
        (
            RetiredCorruption::CandidateActive,
            LocalLogStorageRotationResolutionCollisionReason::CandidateActiveGenerationMismatch,
        ),
        (
            RetiredCorruption::PriorCheckpoint,
            LocalLogStorageRotationResolutionCollisionReason::PriorCheckpointGenerationMismatch,
        ),
        (
            RetiredCorruption::PriorCurrentLength,
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
        ),
        (
            RetiredCorruption::PriorCurrentIndex,
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
        ),
        (
            RetiredCorruption::MissingPriorPredecessor,
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
        ),
    ];
    for (corruption, expected) in cases {
        let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
        let (resolution, observation) =
            corrupted_retired_exact_successor_case(&fixture, corruption)?;
        assert_eq!(collision_reason(complete(resolution, observation)?)?, expected);
    }
    Ok(())
}

#[test]
fn direct_observed_collision_categories_are_preserved() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    for identity in [
        LocalLogStorageRotationResolutionIdentityCollision::CandidateTransaction,
        LocalLogStorageRotationResolutionIdentityCollision::CandidateCommittedHeadIndex,
        LocalLogStorageRotationResolutionIdentityCollision::CandidateActiveGeneration,
        LocalLogStorageRotationResolutionIdentityCollision::CandidateActiveChunkPrefix,
    ] {
        let outcome = complete(
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?,
            LocalLogStorageRotationResolutionObservation::planned_identity_collision(identity),
        )?;
        assert_eq!(
            collision_reason(outcome)?,
            LocalLogStorageRotationResolutionCollisionReason::ObservedPlannedIdentityCollision {
                identity,
            }
        );
    }
    for association in [
        LocalLogStorageRotationResolutionBrokenAssociation::ProfileMetadata,
        LocalLogStorageRotationResolutionBrokenAssociation::ExpectedScopeCandidateMissing,
        LocalLogStorageRotationResolutionBrokenAssociation::ScopeControl,
        LocalLogStorageRotationResolutionBrokenAssociation::SelectedTransaction,
        LocalLogStorageRotationResolutionBrokenAssociation::SelectedCheckpointGeneration,
        LocalLogStorageRotationResolutionBrokenAssociation::SelectedActiveGeneration,
        LocalLogStorageRotationResolutionBrokenAssociation::CurrentCommittedHeadIndex,
        LocalLogStorageRotationResolutionBrokenAssociation::PlanKnownTransaction,
        LocalLogStorageRotationResolutionBrokenAssociation::OrphanScopeArtifact,
    ] {
        let outcome = complete(
            resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?,
            LocalLogStorageRotationResolutionObservation::broken_profile_association(association),
        )?;
        assert_eq!(
            collision_reason(outcome)?,
            LocalLogStorageRotationResolutionCollisionReason::ObservedBrokenProfileAssociation {
                association,
            }
        );
    }
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn stable_rotation_resolution_spellings_cover_the_closed_public_categories() {
    let observation_kinds = [
        (
            LocalLogStorageRotationResolutionObservationKind::ExpectedDatabaseUnavailable,
            "expected_database_unavailable",
        ),
        (
            LocalLogStorageRotationResolutionObservationKind::ExpectedScopeUnavailable,
            "expected_scope_unavailable",
        ),
        (
            LocalLogStorageRotationResolutionObservationKind::CandidateAbsentPriorStillSelected,
            "candidate_absent_prior_still_selected",
        ),
        (
            LocalLogStorageRotationResolutionObservationKind::CandidateAbsentDifferentCurrent,
            "candidate_absent_different_current",
        ),
        (LocalLogStorageRotationResolutionObservationKind::CandidateSelected, "candidate_selected"),
        (
            LocalLogStorageRotationResolutionObservationKind::CandidateImmediatePredecessor,
            "candidate_immediate_predecessor",
        ),
        (
            LocalLogStorageRotationResolutionObservationKind::CandidateRetiredIdentity,
            "candidate_retired_identity",
        ),
        (
            LocalLogStorageRotationResolutionObservationKind::PlannedIdentityCollision,
            "planned_identity_collision",
        ),
        (
            LocalLogStorageRotationResolutionObservationKind::BrokenProfileAssociation,
            "broken_profile_association",
        ),
    ];
    for (kind, spelling) in observation_kinds {
        assert_eq!(kind.as_str(), spelling);
    }

    let outcome_kinds = [
        (
            LocalLogStorageRotationResolutionOutcomeKind::CommittedSelectedAtResolution,
            "committed_selected_at_resolution",
        ),
        (LocalLogStorageRotationResolutionOutcomeKind::CommittedSuperseded, "committed_superseded"),
        (LocalLogStorageRotationResolutionOutcomeKind::ResolutionRetired, "resolution_retired"),
        (
            LocalLogStorageRotationResolutionOutcomeKind::RetryEligibleAtResolution,
            "retry_eligible_at_resolution",
        ),
        (
            LocalLogStorageRotationResolutionOutcomeKind::DefinitelyNotCommittedConflict,
            "definitely_not_committed_conflict",
        ),
        (
            LocalLogStorageRotationResolutionOutcomeKind::CollisionOrCorruption,
            "collision_or_corruption",
        ),
        (
            LocalLogStorageRotationResolutionOutcomeKind::StorageResetOrIndeterminate,
            "storage_reset_or_indeterminate",
        ),
    ];
    for (kind, spelling) in outcome_kinds {
        assert_eq!(kind.as_str(), spelling);
    }

    let sources = [
        (LocalLogStorageRotationResolutionSourceKind::Uncertain, "uncertain"),
        (LocalLogStorageRotationResolutionSourceKind::AttemptAborted, "attempt_aborted"),
        (LocalLogStorageRotationResolutionSourceKind::NotAttempted, "not_attempted"),
        (
            LocalLogStorageRotationResolutionSourceKind::HostAttestedCommitted,
            "host_attested_committed",
        ),
    ];
    for (source, spelling) in sources {
        assert_eq!(source.as_str(), spelling);
    }

    let identities = [
        (
            LocalLogStorageRotationResolutionIdentityCollision::CandidateTransaction,
            "candidate_transaction",
        ),
        (
            LocalLogStorageRotationResolutionIdentityCollision::CandidateCommittedHeadIndex,
            "candidate_committed_head_index",
        ),
        (
            LocalLogStorageRotationResolutionIdentityCollision::CandidateActiveGeneration,
            "candidate_active_generation",
        ),
        (
            LocalLogStorageRotationResolutionIdentityCollision::CandidateActiveChunkPrefix,
            "candidate_active_chunk_prefix",
        ),
    ];
    for (identity, spelling) in identities {
        assert_eq!(identity.as_str(), spelling);
    }

    let reasons = [
        (
            LocalLogStorageRotationResolutionCollisionReason::ExpectedDatabaseObservationMismatch,
            "local_log_storage_rotation_resolution.expected_database_observation_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::ExpectedScopeObservationMismatch,
            "local_log_storage_rotation_resolution.expected_scope_observation_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::PriorSelectionMismatch,
            "local_log_storage_rotation_resolution.prior_selection_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::CandidateSelectedMismatch,
            "local_log_storage_rotation_resolution.candidate_selected_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::CandidateCommittedHeadIndexMismatch,
            "local_log_storage_rotation_resolution.candidate_committed_head_index_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
            "local_log_storage_rotation_resolution.current_committed_head_index_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::CandidateImmediatePredecessorMismatch,
            "local_log_storage_rotation_resolution.candidate_immediate_predecessor_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::PriorCheckpointGenerationMismatch,
            "local_log_storage_rotation_resolution.prior_checkpoint_generation_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::CandidateCheckpointGenerationMismatch,
            "local_log_storage_rotation_resolution.candidate_checkpoint_generation_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::CandidateActiveGenerationMismatch,
            "local_log_storage_rotation_resolution.candidate_active_generation_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::RequiredRetiredTransactionMismatch,
            "local_log_storage_rotation_resolution.required_retired_transaction_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::RetiredTransactionMismatch,
            "local_log_storage_rotation_resolution.retired_transaction_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::RetiredSuccessorMismatch,
            "local_log_storage_rotation_resolution.retired_successor_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::RetiredScopeMismatch,
            "local_log_storage_rotation_resolution.retired_scope_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::DifferentCurrentMismatch,
            "local_log_storage_rotation_resolution.different_current_mismatch",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::CurrentIdentityReuse,
            "local_log_storage_rotation_resolution.current_identity_reuse",
        ),
        (
            LocalLogStorageRotationResolutionCollisionReason::HostAttestedCandidateMissing,
            "local_log_storage_rotation_resolution.host_attested_candidate_missing",
        ),
    ];
    for (reason, spelling) in reasons {
        assert_eq!(reason.as_str(), spelling);
    }
    assert_eq!(
        LocalLogStorageRotationResolutionCollisionReason::ObservedPlannedIdentityCollision {
            identity: LocalLogStorageRotationResolutionIdentityCollision::CandidateTransaction,
        }
        .as_str(),
        "local_log_storage_rotation_resolution.observed_planned_identity_collision"
    );
    assert_eq!(
        LocalLogStorageRotationResolutionCollisionReason::ObservedBrokenProfileAssociation {
            association: LocalLogStorageRotationResolutionBrokenAssociation::ProfileMetadata,
        }
        .as_str(),
        "local_log_storage_rotation_resolution.observed_broken_profile_association"
    );
    assert_eq!(
        LocalLogStorageRotationResolutionStartError::SelectionKindMismatch {
            actual: LocalLogStorageSelectionKind::Root,
        }
        .code()
        .as_str(),
        "local_log_storage_rotation_resolution_start.selection_kind_mismatch"
    );
    assert_eq!(
        LocalLogStorageRotationResolutionTransitionError::RequestAlreadyIssued.code().as_str(),
        "local_log_storage_rotation_resolution_transition.request_already_issued"
    );
    assert_eq!(
        LocalLogStorageRotationResolutionTransitionError::RequestNotIssued.code().as_str(),
        "local_log_storage_rotation_resolution_transition.request_not_issued"
    );
    assert_eq!(
        LocalLogStorageRotationResolutionTransitionError::RequestIdMismatch.code().as_str(),
        "local_log_storage_rotation_resolution_transition.request_id_mismatch"
    );
}

#[test]
fn request_evidence_and_outcome_debug_are_payload_redacted() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let mut resolution =
        resolution(&fixture, LocalLogStorageRotationResolutionSourceKind::Uncertain)?;
    let exact_candidate_json = candidate_json(&fixture)?;
    assert!(exact_candidate_json.contains(PAYLOAD_SENTINEL));
    let observation = selected_observation(&fixture, &resolution, false)?;
    assert_redacted(&format!("{resolution:?}"), &exact_candidate_json);
    let (request_id, request_debug) = {
        let request = resolution.adapter_request()?;
        (request.request_id().clone(), format!("{request:?}"))
    };
    assert_redacted(&request_debug, &exact_candidate_json);
    let evidence =
        LocalLogStorageRotationResolutionEvidence::transaction_completed(&request_id, observation);
    assert_redacted(&format!("{evidence:?}"), &exact_candidate_json);
    let outcome = resolution
        .apply_resolution_evidence(evidence)
        .map_err(|failure| format!("debug test evidence was rejected: {failure:?}"))?;
    assert_redacted(&format!("{outcome:?}"), &exact_candidate_json);
    Ok(())
}
