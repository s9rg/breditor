use std::error::Error;

use crate::{
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryLimits, LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId,
        LocalLogStorageHeadId, LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId,
        LocalSessionId,
    },
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};

use super::{
    DocumentJsonCodec, LocalLogCheckpointJsonCodec, LocalLogFrameLimits,
    LocalLogStorageAttemptTerminalAttestation, LocalLogStorageAttemptTerminalOutcome,
    LocalLogStorageGenerationBinding, LocalLogStorageGenerationJsonCodec,
    LocalLogStorageGenerationPreparationInputs, LocalLogStoragePreparedAttempt,
    LocalLogStorageRetiredTransactionBinding, LocalLogStorageRootBinding,
    LocalLogStorageRootDirectSuccessorObservation, LocalLogStorageRootJsonCodec,
    LocalLogStorageRootOtherScopeObservation, LocalLogStorageRootPreparationInputs,
    LocalLogStorageRootResolution, LocalLogStorageRootResolutionBrokenAssociation,
    LocalLogStorageRootResolutionCollisionReason, LocalLogStorageRootResolutionEvidence,
    LocalLogStorageRootResolutionIdentityCollision, LocalLogStorageRootResolutionObservation,
    LocalLogStorageRootResolutionObservationKind, LocalLogStorageRootResolutionOutcome,
    LocalLogStorageRootResolutionOutcomeKind, LocalLogStorageRootResolutionSourceKind,
    LocalLogStorageRootResolutionTransitionError, LocalLogStorageRootRetiredObservation,
    LocalLogStorageRootSelectedObservation, LocalLogStorageRootSupersededObservation,
    LocalLogStorageSelectedJsonCodec, LocalLogStorageSelectedRoot, LocalLogStorageSelectionKind,
    local_log_storage_generation_selected_tests::SelectedRotationFixture,
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const PAYLOAD_SENTINEL: &str = "ROOTRESOLUTIONPAYLOADSENTINEL_A";
const ALTERNATE_PAYLOAD_SENTINEL: &str = "ROOTRESOLUTIONPAYLOADSENTINEL_B";
const DATABASE_INCARNATION: &str = "database:root-resolution-tests";
const CANDIDATE_SCOPE_INCARNATION: &str = "scope-incarnation:root-resolution-candidate";
const OTHER_SCOPE_INCARNATION: &str = "scope-incarnation:root-resolution-other";

struct RootFixture {
    context: EditorContext,
    binding: LocalLogStorageRootBinding,
    outcome: super::LocalLogTailCompactionOutcome,
    inputs: LocalLogStorageRootPreparationInputs,
}

impl RootFixture {
    fn new(payload: &str, identity: &str) -> TestResult<Self> {
        let context = EditorContext::default();
        let document_json = format!(
            r#"{{"format":"breditor/document","formatVersion":1,"schema":{{"name":"breditor/base","version":1}},"root":{{"kind":"element","type":"breditor/document","entityId":null,"properties":{{}},"children":[{{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{{}},"children":[{{"kind":"text","text":"{payload}","formats":[]}}]}}]}}}}"#,
        );
        let document = DocumentJsonCodec::new(context.schema().clone())
            .with_limits(context.limits().clone())
            .decode(&document_json)?;
        let state = EditorState::try_new(
            &context,
            LineageId::try_new(format!("root-resolution-{identity}"))?,
            document,
            None,
            None,
        )?;
        let session_id = LocalSessionId::try_new(format!("session:root-resolution:{identity}"))?;
        let genesis_log_id = LocalLogId::try_new(format!("log:root-resolution:{identity}:g0"))?;
        let checkpoint_log_id = LocalLogId::try_new(format!("log:root-resolution:{identity}:g1"))?;
        let active_log_id = LocalLogId::try_new(format!("log:root-resolution:{identity}:g2"))?;
        let prior_anchor = LocalLogRecovery::new(session_id, genesis_log_id)
            .recover(EditorSession::new(state), Vec::new())?
            .try_into_checkpoint_anchor(checkpoint_log_id, LocalLogCompactionLimits::default())?;
        let frame_limits = LocalLogFrameLimits::new(4_096);
        let fresh_cursor =
            prior_anchor.begin_successor_tail(LocalLogRecoveryLimits::default(), frame_limits);
        let (owner, _, retained_frame_limits) = fresh_cursor.into_parts();
        let outcome =
            super::LocalLogTailCursor::from_trusted_parts(owner, 123, retained_frame_limits)
                .try_into_checkpoint_anchor(active_log_id)?;

        let binding = LocalLogStorageRootBinding::new(
            crate::local_log::LocalLogStorageProfileId::try_new("breditor/root-resolution-tests")?,
            crate::local_log::LocalLogStorageProfileVersion::try_new(1)?,
            crate::local_log::LocalLogStorageScopeId::try_new("scope:root-resolution-tests")?,
            LocalLogStorageHeadId::try_new(format!("head:root-resolution:{identity}"))?,
        );
        let inputs = LocalLogStorageRootPreparationInputs::new(
            LocalLogStorageTransactionId::try_new(format!(
                "transaction:root-resolution:{identity}"
            ))?,
            LocalLogStorageFenceId::try_new(format!("fence:root-resolution:{identity}"))?,
            LocalLogFrameLimits::new(8_192),
        );
        Ok(Self { context, binding, outcome, inputs })
    }

    fn codec(&self) -> LocalLogStorageRootJsonCodec {
        LocalLogStorageRootJsonCodec::new(self.context.clone(), self.binding.clone())
    }

    fn prepared_attempt(
        &self,
        database_incarnation: &str,
        scope_incarnation: &str,
    ) -> TestResult<LocalLogStoragePreparedAttempt> {
        let codec = self.codec();
        let selection = codec.prepare_root(&self.outcome, &self.inputs)?;
        Ok(codec.prepare_root_attempt(
            &LocalLogStorageDatabaseIncarnationId::try_new(database_incarnation)?,
            &LocalLogStorageScopeIncarnationId::try_new(scope_incarnation)?,
            &selection,
        )?)
    }

    fn resolution(
        &self,
        source: LocalLogStorageRootResolutionSourceKind,
    ) -> TestResult<LocalLogStorageRootResolution> {
        let uncertain = self
            .prepared_attempt(DATABASE_INCARNATION, CANDIDATE_SCOPE_INCARNATION)?
            .begin_attempt();
        match source {
            LocalLogStorageRootResolutionSourceKind::Uncertain => {
                Ok(uncertain.try_begin_root_resolution()?)
            }
            LocalLogStorageRootResolutionSourceKind::AttemptAborted => {
                let mut uncertain = uncertain;
                let request_id = uncertain.adapter_request()?.request_id().clone();
                let attestation =
                    LocalLogStorageAttemptTerminalAttestation::transaction_aborted(&request_id);
                let LocalLogStorageAttemptTerminalOutcome::AttemptAborted(aborted) =
                    uncertain.observe_terminal_attestation(attestation)?
                else {
                    return Err("abort attestation produced the wrong source state".into());
                };
                Ok(aborted.try_begin_root_resolution()?)
            }
            LocalLogStorageRootResolutionSourceKind::NotAttempted => {
                let attempt_id = uncertain.attempt_id().clone();
                let attestation =
                    LocalLogStorageAttemptTerminalAttestation::not_attempted(&attempt_id);
                let LocalLogStorageAttemptTerminalOutcome::NotAttempted(not_attempted) =
                    uncertain.observe_terminal_attestation(attestation)?
                else {
                    return Err("not-attempted attestation produced the wrong source state".into());
                };
                Ok(not_attempted.try_begin_root_resolution()?)
            }
            LocalLogStorageRootResolutionSourceKind::HostAttestedCommitted => {
                let mut uncertain = uncertain;
                let request_id = uncertain.adapter_request()?.request_id().clone();
                let attestation =
                    LocalLogStorageAttemptTerminalAttestation::publication_completed(&request_id);
                let LocalLogStorageAttemptTerminalOutcome::HostAttestedCommitted(committed) =
                    uncertain.observe_terminal_attestation(attestation)?
                else {
                    return Err("complete attestation produced the wrong source state".into());
                };
                Ok(committed.try_begin_root_resolution()?)
            }
        }
    }

    fn normalized_root(
        &self,
        database_incarnation: &str,
        scope_incarnation: &str,
    ) -> TestResult<LocalLogStorageSelectedRoot> {
        let codec = self.codec();
        let selection = codec.prepare_root(&self.outcome, &self.inputs)?;
        let json = codec.encode_root(&selection)?;
        let binding = codec
            .prepare_root_attempt(
                &LocalLogStorageDatabaseIncarnationId::try_new(database_incarnation)?,
                &LocalLogStorageScopeIncarnationId::try_new(scope_incarnation)?,
                &selection,
            )?
            .candidate_binding()
            .clone();
        Ok(LocalLogStorageSelectedJsonCodec::new(self.context.clone(), binding)
            .normalize_root(&json)?)
    }
}

fn candidate_fixture() -> TestResult<RootFixture> {
    RootFixture::new(PAYLOAD_SENTINEL, "candidate")
}

fn complete(
    mut resolution: LocalLogStorageRootResolution,
    observation: LocalLogStorageRootResolutionObservation,
) -> TestResult<LocalLogStorageRootResolutionOutcome> {
    let request_id = resolution.adapter_request()?.request_id().clone();
    let evidence =
        LocalLogStorageRootResolutionEvidence::transaction_completed(&request_id, observation);
    resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
        format!("exactly correlated root evidence was rejected: {failure:?}").into()
    })
}

fn collision_reason(
    outcome: LocalLogStorageRootResolutionOutcome,
) -> TestResult<LocalLogStorageRootResolutionCollisionReason> {
    let LocalLogStorageRootResolutionOutcome::CollisionOrCorruption(resolved) = outcome else {
        return Err("conflicting root observation did not fail closed".into());
    };
    resolved.collision_reason().ok_or_else(|| "collision outcome omitted its reason".into())
}

fn assert_redacted(value: &str, exact_json: &str) {
    assert!(!value.contains(PAYLOAD_SENTINEL), "diagnostic exposed the payload sentinel");
    assert!(!value.contains(exact_json), "diagnostic exposed exact candidate JSON");
}

fn predecessor_root_resolution(
    fixture: &SelectedRotationFixture,
) -> TestResult<LocalLogStorageRootResolution> {
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
    let prepared = codec.prepare_root_attempt(
        receipt.database_incarnation_id(),
        receipt.scope_incarnation_id(),
        &selection,
    )?;
    Ok(prepared.begin_attempt().try_begin_root_resolution()?)
}

fn next_selected_rotation(
    fixture: &SelectedRotationFixture,
) -> TestResult<LocalLogStorageSelectedRoot> {
    let codec = fixture.codec();
    let manifest = fixture.prepared()?;
    let json = codec.encode_rotation_from_selected(&manifest, &fixture.selected)?;
    let binding =
        codec.prepare_rotation_attempt(&fixture.selected, &manifest)?.candidate_binding().clone();
    Ok(LocalLogStorageSelectedJsonCodec::new(fixture.context.clone(), binding)
        .normalize_rotation(&json, fixture.selected.current_selection_json())?)
}

fn third_selected_rotation(
    context: &EditorContext,
    selected: &LocalLogStorageSelectedRoot,
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
    let (owner, _, frame_limits) = cursor.into_parts();
    let outcome = super::LocalLogTailCursor::from_trusted_parts(owner, 0, frame_limits)
        .try_into_checkpoint_anchor(LocalLogId::try_new("log:g4")?)?;
    let codec = LocalLogStorageGenerationJsonCodec::new(
        context.clone(),
        LocalLogStorageGenerationBinding::try_new(
            selected.profile_id().clone(),
            selected.profile_version(),
            selected.scope_id().clone(),
            selected.selected_head_id().clone(),
            LocalLogStorageHeadId::try_new("head:h3")?,
        )?,
    );
    let inputs = LocalLogStorageGenerationPreparationInputs::new(
        LocalLogStorageTransactionId::try_new("transaction:t3")?,
        LocalLogStorageFenceId::try_new("fence:f3")?,
        LocalLogFrameLimits::new(16_384),
    );
    let manifest = codec.prepare_rotation_from_selected(selected, &outcome, &inputs)?;
    let json = codec.encode_rotation_from_selected(&manifest, selected)?;
    let binding = codec.prepare_rotation_attempt(selected, &manifest)?.candidate_binding().clone();
    Ok(LocalLogStorageSelectedJsonCodec::new(context.clone(), binding)
        .normalize_rotation(&json, selected.current_selection_json())?)
}

fn retired_root_binding(
    resolution: &LocalLogStorageRootResolution,
    selection_byte_length: u64,
) -> TestResult<LocalLogStorageRetiredTransactionBinding> {
    let receipt = resolution.candidate_receipt();
    Ok(LocalLogStorageRetiredTransactionBinding::try_new(
        receipt.database_incarnation_id().clone(),
        receipt.scope_id().clone(),
        receipt.scope_incarnation_id().clone(),
        receipt.transaction_id().clone(),
        None,
        receipt.committed_head_id().clone(),
        LocalLogStorageSelectionKind::Root,
        selection_byte_length,
    )?)
}

fn retired_direct_successor_binding(
    fixture: &SelectedRotationFixture,
) -> TestResult<LocalLogStorageRetiredTransactionBinding> {
    let receipt = fixture.selected.current_receipt();
    Ok(LocalLogStorageRetiredTransactionBinding::try_new(
        receipt.database_incarnation_id().clone(),
        receipt.scope_id().clone(),
        receipt.scope_incarnation_id().clone(),
        receipt.transaction_id().clone(),
        receipt.expected_head_id().cloned(),
        receipt.committed_head_id().clone(),
        LocalLogStorageSelectionKind::Rotation,
        u64::try_from(fixture.selected.current_selection_json_bytes())?,
    )?)
}

fn retired_observation_case(
    fixture: &SelectedRotationFixture,
    selection_byte_length_delta: u64,
    corrupt_successor_index: bool,
) -> TestResult<(LocalLogStorageRootResolution, LocalLogStorageRootResolutionObservation)> {
    let resolution = predecessor_root_resolution(fixture)?;
    let current = next_selected_rotation(fixture)?;
    let candidate = resolution.candidate_receipt();
    let candidate_transaction_id = candidate.transaction_id().clone();
    let selection_byte_length = u64::try_from(resolution.candidate_json_bytes())?
        .checked_add(selection_byte_length_delta)
        .ok_or("retired test byte length overflowed")?;
    let retired_transaction = retired_root_binding(&resolution, selection_byte_length)?;
    let successor_transaction_id = fixture.selected.transaction_id().clone();
    let successor_head_index_transaction_id = if corrupt_successor_index {
        candidate_transaction_id.clone()
    } else {
        successor_transaction_id.clone()
    };
    let direct_successor = LocalLogStorageRootDirectSuccessorObservation::exact(
        fixture.selected.current_receipt().clone(),
        successor_head_index_transaction_id,
    );
    let current_transaction_id = current.transaction_id().clone();
    let planned_checkpoint_generation =
        resolution.candidate_binding().checkpoint_generation().clone();
    let (direct_successor_binding, _, _) = fixture.selected.snapshot_attempt_envelope();
    let planned_active_generation = direct_successor_binding.checkpoint_generation().clone();
    let observation = LocalLogStorageRootResolutionObservation::candidate_retired_identity(
        LocalLogStorageRootRetiredObservation::new(
            retired_transaction,
            candidate_transaction_id,
            direct_successor,
            current,
            current_transaction_id,
            planned_checkpoint_generation,
            planned_active_generation,
        ),
    );
    Ok((resolution, observation))
}

fn retired_successor_observation_case(
    fixture: &SelectedRotationFixture,
    current: LocalLogStorageSelectedRoot,
) -> TestResult<(LocalLogStorageRootResolution, LocalLogStorageRootResolutionObservation)> {
    let resolution = predecessor_root_resolution(fixture)?;
    let candidate_transaction_id = resolution.candidate_receipt().transaction_id().clone();
    let retired_transaction =
        retired_root_binding(&resolution, u64::try_from(resolution.candidate_json_bytes())?)?;
    let successor_transaction = retired_direct_successor_binding(fixture)?;
    let successor_transaction_id = successor_transaction.transaction_id().clone();
    let direct_successor = LocalLogStorageRootDirectSuccessorObservation::retired(
        successor_transaction,
        successor_transaction_id,
    );
    let current_transaction_id = current.transaction_id().clone();
    let planned_checkpoint_generation =
        resolution.candidate_binding().checkpoint_generation().clone();
    let (direct_successor_binding, _, _) = fixture.selected.snapshot_attempt_envelope();
    let planned_active_generation = direct_successor_binding.checkpoint_generation().clone();
    let observation = LocalLogStorageRootResolutionObservation::candidate_retired_identity(
        LocalLogStorageRootRetiredObservation::new(
            retired_transaction,
            candidate_transaction_id,
            direct_successor,
            current,
            current_transaction_id,
            planned_checkpoint_generation,
            planned_active_generation,
        ),
    );
    Ok((resolution, observation))
}

#[test]
fn pre_egress_evidence_is_rejected_without_losing_owner_or_evidence() -> TestResult {
    let fixture = candidate_fixture()?;
    let resolution = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let source_attempt_id = resolution.source_attempt_id().clone();
    let candidate_binding = resolution.candidate_binding().clone();
    let candidate_json_bytes = resolution.candidate_json_bytes();

    let mut token_source =
        fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let foreign_request_id = token_source.adapter_request()?.request_id().clone();
    let evidence = LocalLogStorageRootResolutionEvidence::transaction_completed(
        &foreign_request_id,
        LocalLogStorageRootResolutionObservation::planned_scope_absent(),
    );

    let Err(failure) = resolution.apply_resolution_evidence(evidence) else {
        return Err("pre-egress evidence was accepted".into());
    };
    assert_eq!(failure.error(), &LocalLogStorageRootResolutionTransitionError::RequestNotIssued);
    assert_eq!(failure.resolution().source_attempt_id(), &source_attempt_id);
    assert_eq!(failure.resolution().candidate_binding(), &candidate_binding);
    assert_eq!(failure.resolution().candidate_json_bytes(), candidate_json_bytes);
    assert_eq!(failure.evidence().request_id(), &foreign_request_id);
    assert_eq!(
        failure.evidence().observation().kind(),
        LocalLogStorageRootResolutionObservationKind::PlannedScopeAbsent
    );

    let (mut resolution, evidence, error) = failure.into_parts();
    assert_eq!(error, LocalLogStorageRootResolutionTransitionError::RequestNotIssued);
    assert_eq!(evidence.request_id(), &foreign_request_id);
    let emitted_request_id = resolution.adapter_request()?.request_id().clone();
    assert_ne!(emitted_request_id, foreign_request_id);
    Ok(())
}

#[test]
fn cross_request_evidence_can_be_recovered_and_routed_to_its_owner() -> TestResult {
    let fixture = candidate_fixture()?;
    let mut first = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let mut second = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let first_attempt_id = first.source_attempt_id().clone();
    let first_request_id = first.adapter_request()?.request_id().clone();
    let second_request_id = second.adapter_request()?.request_id().clone();
    assert_ne!(first_request_id, second_request_id);

    let evidence = LocalLogStorageRootResolutionEvidence::transaction_completed(
        &second_request_id,
        LocalLogStorageRootResolutionObservation::planned_scope_absent(),
    );
    let Err(failure) = first.apply_resolution_evidence(evidence) else {
        return Err("cross-request evidence was accepted".into());
    };
    assert_eq!(failure.error(), &LocalLogStorageRootResolutionTransitionError::RequestIdMismatch);
    assert_eq!(failure.resolution().source_attempt_id(), &first_attempt_id);
    assert!(failure.resolution().request_issued());
    assert_eq!(failure.evidence().request_id(), &second_request_id);

    let (first, evidence, error) = failure.into_parts();
    assert_eq!(error, LocalLogStorageRootResolutionTransitionError::RequestIdMismatch);
    assert_eq!(first.source_attempt_id(), &first_attempt_id);
    let routed =
        second.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("recovered evidence was rejected by its exact owner: {failure:?}").into()
        })?;
    assert_eq!(routed.kind(), LocalLogStorageRootResolutionOutcomeKind::RetryEligibleAtResolution);
    Ok(())
}

#[test]
fn restart_preserves_plan_but_invalidates_old_completion() -> TestResult {
    let fixture = candidate_fixture()?;
    let mut resolution = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let source_attempt_id = resolution.source_attempt_id().clone();
    let candidate_binding = resolution.candidate_binding().clone();
    let (old_request_id, candidate_pointer, exact_json) = {
        let request = resolution.adapter_request()?;
        (
            request.request_id().clone(),
            request.candidate_json().as_ptr(),
            request.candidate_json().to_owned(),
        )
    };
    let stale = LocalLogStorageRootResolutionEvidence::transaction_completed(
        &old_request_id,
        LocalLogStorageRootResolutionObservation::planned_scope_absent(),
    );

    let mut restarted = resolution.restart_resolution();
    assert_eq!(restarted.source_attempt_id(), &source_attempt_id);
    assert_eq!(restarted.candidate_binding(), &candidate_binding);
    assert!(!restarted.request_issued());
    let new_request_id = {
        let request = restarted.adapter_request()?;
        assert_eq!(request.candidate_json(), exact_json);
        assert_eq!(request.candidate_json().as_ptr(), candidate_pointer);
        request.request_id().clone()
    };
    assert_ne!(new_request_id, old_request_id);

    let Err(failure) = restarted.apply_resolution_evidence(stale) else {
        return Err("completion from a superseded resolver invocation was accepted".into());
    };
    assert_eq!(failure.error(), &LocalLogStorageRootResolutionTransitionError::RequestIdMismatch);
    let (restarted, stale, _) = failure.into_parts();
    assert_eq!(stale.request_id(), &old_request_id);
    let fresh = LocalLogStorageRootResolutionEvidence::transaction_completed(
        &new_request_id,
        LocalLogStorageRootResolutionObservation::planned_scope_absent(),
    );
    let outcome =
        restarted.apply_resolution_evidence(fresh).map_err(|failure| -> Box<dyn Error> {
            format!("fresh completion was rejected after restart: {failure:?}").into()
        })?;
    assert_eq!(outcome.kind(), LocalLogStorageRootResolutionOutcomeKind::RetryEligibleAtResolution);
    Ok(())
}

#[test]
fn clean_absence_is_retry_eligible_for_three_sources_but_reset_after_commit() -> TestResult {
    let fixture = candidate_fixture()?;
    for source in [
        LocalLogStorageRootResolutionSourceKind::Uncertain,
        LocalLogStorageRootResolutionSourceKind::AttemptAborted,
        LocalLogStorageRootResolutionSourceKind::NotAttempted,
    ] {
        let resolution = fixture.resolution(source)?;
        let source_attempt_id = resolution.source_attempt_id().clone();
        let outcome =
            complete(resolution, LocalLogStorageRootResolutionObservation::planned_scope_absent())?;
        assert_eq!(
            outcome.kind(),
            LocalLogStorageRootResolutionOutcomeKind::RetryEligibleAtResolution
        );
        let LocalLogStorageRootResolutionOutcome::RetryEligibleAtResolution(retry) = outcome else {
            return Err("clean absence returned the wrong retry payload".into());
        };
        assert_eq!(retry.source_kind(), source);
        assert_eq!(retry.source_attempt_id(), &source_attempt_id);
    }

    let resolution =
        fixture.resolution(LocalLogStorageRootResolutionSourceKind::HostAttestedCommitted)?;
    let source_attempt_id = resolution.source_attempt_id().clone();
    let outcome =
        complete(resolution, LocalLogStorageRootResolutionObservation::planned_scope_absent())?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRootResolutionOutcomeKind::StorageResetOrIndeterminate
    );
    let LocalLogStorageRootResolutionOutcome::StorageResetOrIndeterminate(resolved) = outcome
    else {
        return Err("post-commit clean absence did not produce reset/indeterminate".into());
    };
    assert_eq!(
        resolved.source_kind(),
        LocalLogStorageRootResolutionSourceKind::HostAttestedCommitted
    );
    assert_eq!(resolved.source_attempt_id(), &source_attempt_id);
    assert_eq!(
        resolved.observation_kind(),
        LocalLogStorageRootResolutionObservationKind::PlannedScopeAbsent
    );
    Ok(())
}

#[test]
fn correlated_noncreating_database_open_absence_is_always_reset_or_indeterminate() -> TestResult {
    let fixture = candidate_fixture()?;
    for source in [
        LocalLogStorageRootResolutionSourceKind::Uncertain,
        LocalLogStorageRootResolutionSourceKind::AttemptAborted,
        LocalLogStorageRootResolutionSourceKind::NotAttempted,
        LocalLogStorageRootResolutionSourceKind::HostAttestedCommitted,
    ] {
        let mut resolution = fixture.resolution(source)?;
        let source_attempt_id = resolution.source_attempt_id().clone();
        let (request_id, exact_json) = {
            let request = resolution.adapter_request()?;
            (request.request_id().clone(), request.candidate_json().to_owned())
        };
        let evidence = LocalLogStorageRootResolutionEvidence::database_open_absent(&request_id);
        assert_eq!(
            evidence.observation().kind(),
            LocalLogStorageRootResolutionObservationKind::ExpectedDatabaseUnavailable
        );
        assert_redacted(&format!("{evidence:?}"), &exact_json);
        let outcome = resolution.apply_resolution_evidence(evidence).map_err(
            |failure| -> Box<dyn Error> {
                format!("correlated database-open absence was rejected: {failure:?}").into()
            },
        )?;
        assert_eq!(
            outcome.kind(),
            LocalLogStorageRootResolutionOutcomeKind::StorageResetOrIndeterminate
        );
        let LocalLogStorageRootResolutionOutcome::StorageResetOrIndeterminate(resolved) = outcome
        else {
            return Err("database-open absence returned the wrong payload".into());
        };
        assert_eq!(resolved.source_kind(), source);
        assert_eq!(resolved.source_attempt_id(), &source_attempt_id);
        assert_eq!(
            resolved.observation_kind(),
            LocalLogStorageRootResolutionObservationKind::ExpectedDatabaseUnavailable
        );
        assert_eq!(resolved.collision_reason(), None);
        assert_redacted(&format!("{resolved:?}"), &exact_json);
    }
    Ok(())
}

#[test]
fn profile_metadata_absence_and_incarnation_findings_have_distinct_outcomes() -> TestResult {
    let fixture = candidate_fixture()?;

    let outcome = complete(
        fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?,
        LocalLogStorageRootResolutionObservation::empty_database_without_profile_record(),
    )?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRootResolutionOutcomeKind::StorageResetOrIndeterminate
    );

    let resolution = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let expected_database_incarnation =
        resolution.candidate_receipt().database_incarnation_id().clone();
    let outcome = complete(
        resolution,
        LocalLogStorageRootResolutionObservation::expected_database_incarnation_mismatch(
            expected_database_incarnation,
        ),
    )?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRootResolutionCollisionReason::ExpectedDatabaseObservationMismatch
    );

    let outcome = complete(
        fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?,
        LocalLogStorageRootResolutionObservation::expected_database_incarnation_mismatch(
            LocalLogStorageDatabaseIncarnationId::try_new("database:root-resolution-different")?,
        ),
    )?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRootResolutionOutcomeKind::StorageResetOrIndeterminate
    );

    let outcome = complete(
        fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?,
        LocalLogStorageRootResolutionObservation::broken_profile_association(
            LocalLogStorageRootResolutionBrokenAssociation::ProfileMetadata,
        ),
    )?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRootResolutionCollisionReason::ObservedBrokenProfileAssociation {
            association: LocalLogStorageRootResolutionBrokenAssociation::ProfileMetadata,
        }
    );
    Ok(())
}

#[test]
fn clean_absence_exact_retry_preserves_plan_allocation_and_refreshes_attempt_id() -> TestResult {
    let fixture = candidate_fixture()?;
    let mut resolution = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let original_attempt_id = resolution.source_attempt_id().clone();
    let candidate_binding = resolution.candidate_binding().clone();
    let (request_id, candidate_pointer, exact_json) = {
        let request = resolution.adapter_request()?;
        (
            request.request_id().clone(),
            request.candidate_json().as_ptr(),
            request.candidate_json().to_owned(),
        )
    };
    let evidence = LocalLogStorageRootResolutionEvidence::transaction_completed(
        &request_id,
        LocalLogStorageRootResolutionObservation::planned_scope_absent(),
    );
    let outcome =
        resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("clean-absence evidence failed: {failure:?}").into()
        })?;
    let LocalLogStorageRootResolutionOutcome::RetryEligibleAtResolution(retry) = outcome else {
        return Err("clean absence was not retry eligible".into());
    };
    assert_eq!(retry.candidate_binding(), &candidate_binding);
    assert_eq!(retry.candidate_json_bytes(), exact_json.len());

    let mut resubmitted = retry.begin_exact_resubmission();
    assert_ne!(resubmitted.attempt_id(), &original_attempt_id);
    assert_eq!(resubmitted.candidate_binding(), &candidate_binding);
    let request = resubmitted.adapter_request()?;
    assert_eq!(request.candidate_json(), exact_json);
    assert_eq!(request.candidate_json().as_ptr(), candidate_pointer);
    assert_eq!(request.candidate_binding(), &candidate_binding);
    Ok(())
}

#[test]
fn exact_candidate_selected_is_positive_and_retains_source_facts() -> TestResult {
    let fixture = candidate_fixture()?;
    let mut resolution = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let source_attempt_id = resolution.source_attempt_id().clone();
    let (request_id, candidate_binding, exact_json) = {
        let request = resolution.adapter_request()?;
        (
            request.request_id().clone(),
            request.candidate_binding().clone(),
            request.candidate_json().to_owned(),
        )
    };
    let selected =
        LocalLogStorageSelectedJsonCodec::new(fixture.context.clone(), candidate_binding.clone())
            .normalize_root(&exact_json)?;
    let selected_observation = LocalLogStorageRootSelectedObservation::new(
        selected,
        candidate_binding.current_receipt().transaction_id().clone(),
    );
    let evidence = LocalLogStorageRootResolutionEvidence::transaction_completed(
        &request_id,
        LocalLogStorageRootResolutionObservation::candidate_selected(selected_observation),
    );
    let outcome =
        resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("exact candidate-selected evidence failed: {failure:?}").into()
        })?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageRootResolutionOutcomeKind::CommittedSelectedAtResolution
    );
    let LocalLogStorageRootResolutionOutcome::CommittedSelectedAtResolution(resolved) = outcome
    else {
        return Err("exact selected candidate returned the wrong payload".into());
    };
    assert_eq!(resolved.source_attempt_id(), &source_attempt_id);
    assert_eq!(resolved.candidate_binding(), &candidate_binding);
    assert_eq!(
        resolved.observation_kind(),
        LocalLogStorageRootResolutionObservationKind::CandidateSelected
    );
    assert_eq!(resolved.collision_reason(), None);
    Ok(())
}

#[test]
fn candidate_selected_bytes_and_head_index_are_checked_independently() -> TestResult {
    let fixture = candidate_fixture()?;
    let alternate = RootFixture::new(ALTERNATE_PAYLOAD_SENTINEL, "candidate")?;

    let mut resolution = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let (request_id, candidate_binding, exact_json) = {
        let request = resolution.adapter_request()?;
        (
            request.request_id().clone(),
            request.candidate_binding().clone(),
            request.candidate_json().to_owned(),
        )
    };
    let alternate_codec = alternate.codec();
    let alternate_selection =
        alternate_codec.prepare_root(&alternate.outcome, &alternate.inputs)?;
    let alternate_json = alternate_codec.encode_root(&alternate_selection)?;
    assert_ne!(alternate_json, exact_json);
    assert_eq!(alternate_json.len(), exact_json.len());
    let selected =
        LocalLogStorageSelectedJsonCodec::new(fixture.context.clone(), candidate_binding.clone())
            .normalize_root(&alternate_json)?;
    let observation = LocalLogStorageRootResolutionObservation::candidate_selected(
        LocalLogStorageRootSelectedObservation::new(
            selected,
            candidate_binding.current_receipt().transaction_id().clone(),
        ),
    );
    let evidence =
        LocalLogStorageRootResolutionEvidence::transaction_completed(&request_id, observation);
    let outcome =
        resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("byte-mismatch evidence was not correlated: {failure:?}").into()
        })?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRootResolutionCollisionReason::CandidateSelectedMismatch
    );

    let mut resolution = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let (request_id, candidate_binding, exact_json) = {
        let request = resolution.adapter_request()?;
        (
            request.request_id().clone(),
            request.candidate_binding().clone(),
            request.candidate_json().to_owned(),
        )
    };
    let selected =
        LocalLogStorageSelectedJsonCodec::new(fixture.context.clone(), candidate_binding)
            .normalize_root(&exact_json)?;
    let observation = LocalLogStorageRootResolutionObservation::candidate_selected(
        LocalLogStorageRootSelectedObservation::new(
            selected,
            LocalLogStorageTransactionId::try_new("transaction:wrong-head-index")?,
        ),
    );
    let evidence =
        LocalLogStorageRootResolutionEvidence::transaction_completed(&request_id, observation);
    let outcome =
        resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("index-mismatch evidence was not correlated: {failure:?}").into()
        })?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRootResolutionCollisionReason::CandidateCommittedHeadIndexMismatch
    );
    Ok(())
}

#[test]
fn exact_immediate_predecessor_accepts_reclaimed_cleanup_state() -> TestResult {
    let fixture = SelectedRotationFixture::reclaimed_rotation()?;
    let resolution = predecessor_root_resolution(&fixture)?;
    let candidate_transaction_id = resolution.candidate_receipt().transaction_id().clone();
    let planned_checkpoint_generation =
        resolution.candidate_binding().checkpoint_generation().clone();
    let current_transaction_id = fixture.selected.transaction_id().clone();
    let observation = LocalLogStorageRootResolutionObservation::candidate_immediate_predecessor(
        LocalLogStorageRootSupersededObservation::new(
            fixture.selected,
            candidate_transaction_id,
            current_transaction_id,
            planned_checkpoint_generation,
        ),
    );
    let outcome = complete(resolution, observation)?;
    assert_eq!(outcome.kind(), LocalLogStorageRootResolutionOutcomeKind::CommittedSuperseded);
    let LocalLogStorageRootResolutionOutcome::CommittedSuperseded(resolved) = outcome else {
        return Err("exact immediate predecessor returned the wrong payload".into());
    };
    assert_eq!(
        resolved.observation_kind(),
        LocalLogStorageRootResolutionObservationKind::CandidateImmediatePredecessor
    );
    assert_eq!(resolved.collision_reason(), None);
    Ok(())
}

#[test]
fn superseded_current_index_cannot_reuse_candidate_transaction() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let resolution = predecessor_root_resolution(&fixture)?;
    let candidate_transaction_id = resolution.candidate_receipt().transaction_id().clone();
    let planned_checkpoint_generation =
        resolution.candidate_binding().checkpoint_generation().clone();
    let observation = LocalLogStorageRootResolutionObservation::candidate_immediate_predecessor(
        LocalLogStorageRootSupersededObservation::new(
            fixture.selected,
            candidate_transaction_id.clone(),
            candidate_transaction_id,
            planned_checkpoint_generation,
        ),
    );
    let outcome = complete(resolution, observation)?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRootResolutionCollisionReason::CurrentCommittedHeadIndexMismatch
    );
    Ok(())
}

#[test]
fn exact_retired_candidate_requires_a_valid_direct_successor_and_current_graph() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let (resolution, observation) = retired_observation_case(&fixture, 0, false)?;
    let outcome = complete(resolution, observation)?;
    assert_eq!(outcome.kind(), LocalLogStorageRootResolutionOutcomeKind::ResolutionRetired);
    let LocalLogStorageRootResolutionOutcome::ResolutionRetired(resolved) = outcome else {
        return Err("exact retired candidate returned the wrong payload".into());
    };
    assert_eq!(
        resolved.observation_kind(),
        LocalLogStorageRootResolutionObservationKind::CandidateRetiredIdentity
    );
    assert_eq!(resolved.collision_reason(), None);
    Ok(())
}

#[test]
fn exact_retired_successor_must_seal_the_candidate_active_generation() -> TestResult {
    let normal = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let altered = SelectedRotationFixture::rotation_with_unrelated_checkpoint_generation()?;
    let resolution = predecessor_root_resolution(&normal)?;
    let current = next_selected_rotation(&altered)?;

    let candidate_receipt = resolution.candidate_receipt().clone();
    let candidate_binding = resolution.candidate_binding().clone();
    let candidate_active = candidate_binding.active_generation();
    let successor_receipt = altered.selected.current_receipt().clone();
    let (normal_successor_binding, _, _) = normal.selected.snapshot_attempt_envelope();
    let (altered_successor_binding, _, _) = altered.selected.snapshot_attempt_envelope();
    let planned_active_generation = normal_successor_binding.checkpoint_generation().clone();
    let altered_checkpoint_generation = altered_successor_binding.checkpoint_generation();

    assert_eq!(normal.selected.current_receipt(), &successor_receipt);
    assert_ne!(normal.selected.current_selection_json(), altered.selected.current_selection_json());
    assert_eq!(current.selection_kind(), LocalLogStorageSelectionKind::Rotation);
    assert_eq!(current.predecessor_receipt(), Some(&successor_receipt));
    assert_eq!(
        current.predecessor_selection_json(),
        Some(altered.selected.current_selection_json())
    );
    assert_eq!(successor_receipt.expected_head_id(), Some(candidate_receipt.committed_head_id()));
    assert_ne!(successor_receipt.transaction_id(), candidate_receipt.transaction_id());
    assert_ne!(successor_receipt.committed_head_id(), candidate_receipt.committed_head_id());
    assert_eq!(current.previous_head_id(), Some(successor_receipt.committed_head_id()));

    let sealed_generation = current
        .predecessor_rotation_sealed_generation()
        .ok_or("valid current graph omitted its predecessor rotation's sealed generation")?;
    assert_eq!(sealed_generation.log_id(), altered_checkpoint_generation.log_id());
    assert_eq!(Some(sealed_generation.frame()), altered_checkpoint_generation.frame());
    assert_ne!(sealed_generation.log_id(), candidate_active.log_id());
    assert_eq!(sealed_generation.frame(), candidate_active.frame());

    assert_eq!(planned_active_generation.log_id(), candidate_active.log_id());
    assert_eq!(planned_active_generation.session_id(), candidate_active.session_id());
    assert_eq!(planned_active_generation.frame(), Some(candidate_active.frame()));
    assert_eq!(
        planned_active_generation.activated_fence_id(),
        Some(candidate_active.activated_fence_id())
    );
    assert_eq!(
        planned_active_generation.activated_by_head_id(),
        Some(candidate_active.activated_by_head_id())
    );
    assert_eq!(
        planned_active_generation.retired_by_head_id(),
        Some(successor_receipt.committed_head_id())
    );
    assert!(
        candidate_active
            .validate_retired_checkpoint_observation(
                &planned_active_generation,
                successor_receipt.committed_head_id(),
            )
            .is_ok()
    );

    assert_ne!(current.transaction_id(), candidate_receipt.transaction_id());
    assert_ne!(current.transaction_id(), successor_receipt.transaction_id());
    assert_ne!(current.selected_head_id(), candidate_receipt.committed_head_id());
    assert_ne!(current.checkpoint_log_id(), candidate_binding.checkpoint_generation().log_id());
    assert_ne!(current.checkpoint_log_id(), candidate_active.log_id());
    assert_ne!(current.active_log_id(), candidate_binding.checkpoint_generation().log_id());
    assert_ne!(current.active_log_id(), candidate_active.log_id());

    let candidate_transaction_id = candidate_receipt.transaction_id().clone();
    let successor_transaction_id = successor_receipt.transaction_id().clone();
    let current_transaction_id = current.transaction_id().clone();
    let retired_transaction =
        retired_root_binding(&resolution, u64::try_from(resolution.candidate_json_bytes())?)?;
    let planned_checkpoint_generation = candidate_binding.checkpoint_generation().clone();
    let direct_successor = LocalLogStorageRootDirectSuccessorObservation::exact(
        successor_receipt,
        successor_transaction_id,
    );
    let observation = LocalLogStorageRootResolutionObservation::candidate_retired_identity(
        LocalLogStorageRootRetiredObservation::new(
            retired_transaction,
            candidate_transaction_id,
            direct_successor,
            current,
            current_transaction_id,
            planned_checkpoint_generation,
            planned_active_generation,
        ),
    );
    let outcome = complete(resolution, observation)?;
    assert_eq!(outcome.kind(), LocalLogStorageRootResolutionOutcomeKind::CollisionOrCorruption);
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRootResolutionCollisionReason::RetiredSuccessorMismatch
    );
    Ok(())
}

#[test]
fn retired_direct_successor_is_positive_when_it_is_older_than_visible_predecessor() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let second_rotation = next_selected_rotation(&fixture)?;
    let third_rotation = third_selected_rotation(&fixture.context, &second_rotation)?;
    assert_ne!(third_rotation.predecessor_receipt(), Some(fixture.selected.current_receipt()));
    let (resolution, observation) = retired_successor_observation_case(&fixture, third_rotation)?;
    let outcome = complete(resolution, observation)?;
    assert_eq!(outcome.kind(), LocalLogStorageRootResolutionOutcomeKind::ResolutionRetired);
    Ok(())
}

#[test]
fn retired_successor_cannot_overlap_the_visible_predecessor_state() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let second_rotation = next_selected_rotation(&fixture)?;
    assert_eq!(second_rotation.predecessor_receipt(), Some(fixture.selected.current_receipt()));
    let (resolution, observation) = retired_successor_observation_case(&fixture, second_rotation)?;
    assert_eq!(
        collision_reason(complete(resolution, observation)?)?,
        LocalLogStorageRootResolutionCollisionReason::RetiredSuccessorMismatch
    );
    Ok(())
}

#[test]
fn retired_tombstone_and_direct_successor_mismatches_are_distinct() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let (resolution, observation) = retired_observation_case(&fixture, 1, false)?;
    assert_eq!(
        collision_reason(complete(resolution, observation)?)?,
        LocalLogStorageRootResolutionCollisionReason::RetiredTransactionMismatch
    );

    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let (resolution, observation) = retired_observation_case(&fixture, 0, true)?;
    assert_eq!(
        collision_reason(complete(resolution, observation)?)?,
        LocalLogStorageRootResolutionCollisionReason::RetiredSuccessorMismatch
    );
    Ok(())
}

#[test]
fn retired_current_graph_cannot_reuse_nonadjacent_candidate_generation() -> TestResult {
    let fixture =
        SelectedRotationFixture::rotation_with_next_active_reusing_root_checkpoint_generation()?;
    let (resolution, observation) = retired_observation_case(&fixture, 0, false)?;
    assert_eq!(
        collision_reason(complete(resolution, observation)?)?,
        LocalLogStorageRootResolutionCollisionReason::CurrentIdentityReuse
    );
    Ok(())
}

#[test]
fn retired_current_active_generation_cannot_reuse_candidate_active_fence() -> TestResult {
    let fixture = SelectedRotationFixture::rotation_with_next_active_reusing_root_active_fence()?;
    let current = next_selected_rotation(&fixture)?;
    let resolution = predecessor_root_resolution(&fixture)?;
    let current_binding = current.binding();
    let candidate_binding = resolution.candidate_binding();
    assert_eq!(
        current_binding.active_generation().activated_fence_id(),
        candidate_binding.active_generation().activated_fence_id()
    );
    assert_ne!(
        current_binding.checkpoint_generation().log_id(),
        candidate_binding.checkpoint_generation().log_id()
    );
    assert_ne!(
        current_binding.checkpoint_generation().log_id(),
        candidate_binding.active_generation().log_id()
    );
    assert_ne!(
        current_binding.active_generation().log_id(),
        candidate_binding.checkpoint_generation().log_id()
    );
    assert_ne!(
        current_binding.active_generation().log_id(),
        candidate_binding.active_generation().log_id()
    );
    drop(resolution);

    let (resolution, observation) = retired_observation_case(&fixture, 0, false)?;
    assert_eq!(
        collision_reason(complete(resolution, observation)?)?,
        LocalLogStorageRootResolutionCollisionReason::CurrentIdentityReuse
    );
    Ok(())
}

#[test]
fn reported_identity_and_association_failures_map_without_losing_category() -> TestResult {
    let fixture = candidate_fixture()?;
    for identity in [
        LocalLogStorageRootResolutionIdentityCollision::CandidateTransaction,
        LocalLogStorageRootResolutionIdentityCollision::CandidateCommittedHeadIndex,
        LocalLogStorageRootResolutionIdentityCollision::PlannedCheckpointGeneration,
        LocalLogStorageRootResolutionIdentityCollision::PlannedActiveGeneration,
        LocalLogStorageRootResolutionIdentityCollision::ScopeArtifactRange,
    ] {
        let observation =
            LocalLogStorageRootResolutionObservation::planned_identity_collision(identity);
        assert_eq!(
            observation.kind(),
            LocalLogStorageRootResolutionObservationKind::PlannedIdentityCollision
        );
        let outcome = complete(
            fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?,
            observation,
        )?;
        assert_eq!(
            collision_reason(outcome)?,
            LocalLogStorageRootResolutionCollisionReason::ObservedPlannedIdentityCollision {
                identity,
            }
        );
    }

    for association in [
        LocalLogStorageRootResolutionBrokenAssociation::ProfileMetadata,
        LocalLogStorageRootResolutionBrokenAssociation::ExpectedScopeCandidateMissing,
        LocalLogStorageRootResolutionBrokenAssociation::ScopeControl,
        LocalLogStorageRootResolutionBrokenAssociation::SelectedTransaction,
        LocalLogStorageRootResolutionBrokenAssociation::SelectedCheckpointGeneration,
        LocalLogStorageRootResolutionBrokenAssociation::SelectedActiveGeneration,
        LocalLogStorageRootResolutionBrokenAssociation::CurrentCommittedHeadIndex,
        LocalLogStorageRootResolutionBrokenAssociation::OrphanScopeArtifact,
    ] {
        let observation =
            LocalLogStorageRootResolutionObservation::broken_profile_association(association);
        assert_eq!(
            observation.kind(),
            LocalLogStorageRootResolutionObservationKind::BrokenProfileAssociation
        );
        let outcome = complete(
            fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?,
            observation,
        )?;
        assert_eq!(
            collision_reason(outcome)?,
            LocalLogStorageRootResolutionCollisionReason::ObservedBrokenProfileAssociation {
                association,
            }
        );
    }
    Ok(())
}

#[test]
fn other_scope_is_source_aware_and_same_incarnation_fails_closed() -> TestResult {
    let candidate = candidate_fixture()?;
    for (source, expected) in [
        (
            LocalLogStorageRootResolutionSourceKind::Uncertain,
            LocalLogStorageRootResolutionOutcomeKind::ScopeAlreadyProvisioned,
        ),
        (
            LocalLogStorageRootResolutionSourceKind::HostAttestedCommitted,
            LocalLogStorageRootResolutionOutcomeKind::StorageResetOrIndeterminate,
        ),
    ] {
        let other = RootFixture::new(PAYLOAD_SENTINEL, "other")?;
        let selected = other.normalized_root(DATABASE_INCARNATION, OTHER_SCOPE_INCARNATION)?;
        let index_transaction_id = selected.transaction_id().clone();
        let observation = LocalLogStorageRootResolutionObservation::other_valid_scope(
            LocalLogStorageRootOtherScopeObservation::new(selected, index_transaction_id),
        );
        let outcome = complete(candidate.resolution(source)?, observation)?;
        assert_eq!(outcome.kind(), expected);
    }

    let other = RootFixture::new(PAYLOAD_SENTINEL, "other")?;
    let selected = other.normalized_root(DATABASE_INCARNATION, CANDIDATE_SCOPE_INCARNATION)?;
    let index_transaction_id = selected.transaction_id().clone();
    let observation = LocalLogStorageRootResolutionObservation::other_valid_scope(
        LocalLogStorageRootOtherScopeObservation::new(selected, index_transaction_id),
    );
    let outcome = complete(
        candidate.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?,
        observation,
    )?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageRootResolutionCollisionReason::OtherScopeMismatch
    );
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn new_resolution_categories_keep_stable_spellings() {
    for (kind, spelling) in [
        (LocalLogStorageRootResolutionSourceKind::Uncertain, "uncertain"),
        (LocalLogStorageRootResolutionSourceKind::AttemptAborted, "attempt_aborted"),
        (LocalLogStorageRootResolutionSourceKind::NotAttempted, "not_attempted"),
        (LocalLogStorageRootResolutionSourceKind::HostAttestedCommitted, "host_attested_committed"),
    ] {
        assert_eq!(kind.as_str(), spelling);
    }

    for (kind, spelling) in [
        (
            LocalLogStorageRootResolutionObservationKind::ExpectedDatabaseUnavailable,
            "expected_database_unavailable",
        ),
        (LocalLogStorageRootResolutionObservationKind::PlannedScopeAbsent, "planned_scope_absent"),
        (LocalLogStorageRootResolutionObservationKind::CandidateSelected, "candidate_selected"),
        (
            LocalLogStorageRootResolutionObservationKind::CandidateImmediatePredecessor,
            "candidate_immediate_predecessor",
        ),
        (
            LocalLogStorageRootResolutionObservationKind::CandidateRetiredIdentity,
            "candidate_retired_identity",
        ),
        (LocalLogStorageRootResolutionObservationKind::OtherValidScope, "other_valid_scope"),
        (
            LocalLogStorageRootResolutionObservationKind::PlannedIdentityCollision,
            "planned_identity_collision",
        ),
        (
            LocalLogStorageRootResolutionObservationKind::BrokenProfileAssociation,
            "broken_profile_association",
        ),
    ] {
        assert_eq!(kind.as_str(), spelling);
    }

    for (kind, spelling) in [
        (
            LocalLogStorageRootResolutionOutcomeKind::CommittedSelectedAtResolution,
            "committed_selected_at_resolution",
        ),
        (LocalLogStorageRootResolutionOutcomeKind::CommittedSuperseded, "committed_superseded"),
        (LocalLogStorageRootResolutionOutcomeKind::ResolutionRetired, "resolution_retired"),
        (
            LocalLogStorageRootResolutionOutcomeKind::RetryEligibleAtResolution,
            "retry_eligible_at_resolution",
        ),
        (
            LocalLogStorageRootResolutionOutcomeKind::ScopeAlreadyProvisioned,
            "scope_already_provisioned",
        ),
        (
            LocalLogStorageRootResolutionOutcomeKind::CollisionOrCorruption,
            "collision_or_corruption",
        ),
        (
            LocalLogStorageRootResolutionOutcomeKind::StorageResetOrIndeterminate,
            "storage_reset_or_indeterminate",
        ),
    ] {
        assert_eq!(kind.as_str(), spelling);
    }

    for (kind, spelling) in [
        (
            LocalLogStorageRootResolutionIdentityCollision::CandidateTransaction,
            "candidate_transaction",
        ),
        (
            LocalLogStorageRootResolutionIdentityCollision::CandidateCommittedHeadIndex,
            "candidate_committed_head_index",
        ),
        (
            LocalLogStorageRootResolutionIdentityCollision::PlannedCheckpointGeneration,
            "planned_checkpoint_generation",
        ),
        (
            LocalLogStorageRootResolutionIdentityCollision::PlannedActiveGeneration,
            "planned_active_generation",
        ),
        (
            LocalLogStorageRootResolutionIdentityCollision::ScopeArtifactRange,
            "scope_artifact_range",
        ),
    ] {
        assert_eq!(kind.as_str(), spelling);
    }

    for (kind, spelling) in [
        (LocalLogStorageRootResolutionBrokenAssociation::ProfileMetadata, "profile_metadata"),
        (
            LocalLogStorageRootResolutionBrokenAssociation::ExpectedScopeCandidateMissing,
            "expected_scope_candidate_missing",
        ),
        (LocalLogStorageRootResolutionBrokenAssociation::ScopeControl, "scope_control"),
        (
            LocalLogStorageRootResolutionBrokenAssociation::SelectedTransaction,
            "selected_transaction",
        ),
        (
            LocalLogStorageRootResolutionBrokenAssociation::SelectedCheckpointGeneration,
            "selected_checkpoint_generation",
        ),
        (
            LocalLogStorageRootResolutionBrokenAssociation::SelectedActiveGeneration,
            "selected_active_generation",
        ),
        (
            LocalLogStorageRootResolutionBrokenAssociation::CurrentCommittedHeadIndex,
            "current_committed_head_index",
        ),
        (
            LocalLogStorageRootResolutionBrokenAssociation::OrphanScopeArtifact,
            "orphan_scope_artifact",
        ),
    ] {
        assert_eq!(kind.as_str(), spelling);
    }

    for (reason, spelling) in [
        (
            LocalLogStorageRootResolutionCollisionReason::ExpectedDatabaseObservationMismatch,
            "local_log_storage_root_resolution.expected_database_observation_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::CandidateSelectedMismatch,
            "local_log_storage_root_resolution.candidate_selected_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::CandidateCommittedHeadIndexMismatch,
            "local_log_storage_root_resolution.candidate_committed_head_index_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::CandidateImmediatePredecessorMismatch,
            "local_log_storage_root_resolution.candidate_immediate_predecessor_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::CurrentCommittedHeadIndexMismatch,
            "local_log_storage_root_resolution.current_committed_head_index_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::CurrentIdentityReuse,
            "local_log_storage_root_resolution.current_identity_reuse",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::PlannedCheckpointGenerationMismatch,
            "local_log_storage_root_resolution.planned_checkpoint_generation_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::PlannedActiveGenerationMismatch,
            "local_log_storage_root_resolution.planned_active_generation_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::RetiredTransactionMismatch,
            "local_log_storage_root_resolution.retired_transaction_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::RetiredSuccessorMismatch,
            "local_log_storage_root_resolution.retired_successor_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::RetiredScopeMismatch,
            "local_log_storage_root_resolution.retired_scope_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::OtherScopeMismatch,
            "local_log_storage_root_resolution.other_scope_mismatch",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::ObservedPlannedIdentityCollision {
                identity: LocalLogStorageRootResolutionIdentityCollision::CandidateTransaction,
            },
            "local_log_storage_root_resolution.observed_planned_identity_collision",
        ),
        (
            LocalLogStorageRootResolutionCollisionReason::ObservedBrokenProfileAssociation {
                association: LocalLogStorageRootResolutionBrokenAssociation::ScopeControl,
            },
            "local_log_storage_root_resolution.observed_broken_profile_association",
        ),
    ] {
        assert_eq!(reason.as_str(), spelling);
    }
}

#[test]
fn request_evidence_failure_retry_and_outcome_debug_are_payload_redacted() -> TestResult {
    let fixture = candidate_fixture()?;
    let mut exact_owner = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let owner_debug = format!("{exact_owner:?}");
    let (request_id, binding, exact_json, request_debug) = {
        let request = exact_owner.adapter_request()?;
        (
            request.request_id().clone(),
            request.candidate_binding().clone(),
            request.candidate_json().to_owned(),
            format!("{request:?}"),
        )
    };
    assert_redacted(&owner_debug, &exact_json);
    assert_redacted(&request_debug, &exact_json);

    let selected = LocalLogStorageSelectedJsonCodec::new(fixture.context.clone(), binding.clone())
        .normalize_root(&exact_json)?;
    let evidence = LocalLogStorageRootResolutionEvidence::transaction_completed(
        &request_id,
        LocalLogStorageRootResolutionObservation::candidate_selected(
            LocalLogStorageRootSelectedObservation::new(
                selected,
                binding.current_receipt().transaction_id().clone(),
            ),
        ),
    );
    assert_redacted(&format!("{evidence:?}"), &exact_json);

    let mut wrong_owner = fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?;
    let _wrong_request_id = wrong_owner.adapter_request()?.request_id().clone();
    let Err(failure) = wrong_owner.apply_resolution_evidence(evidence) else {
        return Err("cross-request evidence was accepted during redaction test".into());
    };
    assert_redacted(&format!("{failure:?}"), &exact_json);
    let (_, evidence, _) = failure.into_parts();
    let outcome =
        exact_owner.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("exact selected evidence was rejected: {failure:?}").into()
        })?;
    assert_redacted(&format!("{outcome:?}"), &exact_json);

    let retry_outcome = complete(
        fixture.resolution(LocalLogStorageRootResolutionSourceKind::Uncertain)?,
        LocalLogStorageRootResolutionObservation::planned_scope_absent(),
    )?;
    assert_redacted(&format!("{retry_outcome:?}"), &exact_json);
    Ok(())
}
