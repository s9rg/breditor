//! Adversarial contracts for same-process append callback resolution.

use std::error::Error;

use crate::local_log::{
    LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId,
    LocalLogStorageAppendResolutionRequestId, LocalLogStorageChunkStart,
    LocalLogStorageDatabaseIncarnationId, LocalLogStorageFenceId,
    LocalLogStorageScopeIncarnationId, LocalLogStorageTransactionId,
};

use super::{
    LocalLogStorageAppendQueue, LocalLogStorageAppendQueueEnqueueErrorCode,
    LocalLogStorageAppendQueueLimits, LocalLogStorageAppendResolution,
    LocalLogStorageAppendResolutionCollisionReason,
    LocalLogStorageAppendResolutionCurrentObservation, LocalLogStorageAppendResolutionEvidence,
    LocalLogStorageAppendResolutionHeadAbsentAtTailObservation,
    LocalLogStorageAppendResolutionHeadAcknowledgementOutcome,
    LocalLogStorageAppendResolutionHeadRecordFinalObservation,
    LocalLogStorageAppendResolutionLaterRecordObservation,
    LocalLogStorageAppendResolutionLaterTargetObservation,
    LocalLogStorageAppendResolutionObservation, LocalLogStorageAppendResolutionObservationKind,
    LocalLogStorageAppendResolutionObservedDefect, LocalLogStorageAppendResolutionOutcome,
    LocalLogStorageAppendResolutionOutcomeKind, LocalLogStorageAppendResolutionSourceKind,
    LocalLogStorageAppendResolutionTransitionError,
    LocalLogStorageAppendResolutionTransitionErrorCode, LocalLogStorageAppendTerminalAttestation,
    LocalLogStorageAppendTerminalOutcome, LocalLogStorageSelectedBinding,
    LocalLogStorageSelectedJsonCodec, LocalLogStorageSelectedRoot, LocalLogStorageSelectionKind,
    LocalLogStorageSelectionReceiptBinding,
    local_log_storage_append_attempt_adversarial_tests::{
        FRAME_SENTINEL, QueueSnapshot, SELECTION_SENTINEL, TestResult, insertion_entry, queue,
    },
    local_log_storage_generation_selected_tests::SelectedRotationFixture,
};

const RESOLUTION_SENTINEL: &str = "APPEND-RESOLUTION-PRIVATE-FRAME-SENTINEL";

#[derive(Clone, Copy, Debug)]
enum SourceCase {
    UncertainBeforeEgress,
    UncertainAfterEgress,
    AttemptAborted,
    NotAttemptedBeforeEgress,
    NotAttemptedAfterEgress,
}

impl SourceCase {
    const ALL: [Self; 5] = [
        Self::UncertainBeforeEgress,
        Self::UncertainAfterEgress,
        Self::AttemptAborted,
        Self::NotAttemptedBeforeEgress,
        Self::NotAttemptedAfterEgress,
    ];

    const fn kind(self) -> LocalLogStorageAppendResolutionSourceKind {
        match self {
            Self::UncertainBeforeEgress | Self::UncertainAfterEgress => {
                LocalLogStorageAppendResolutionSourceKind::Uncertain
            }
            Self::AttemptAborted => LocalLogStorageAppendResolutionSourceKind::AttemptAborted,
            Self::NotAttemptedBeforeEgress | Self::NotAttemptedAfterEgress => {
                LocalLogStorageAppendResolutionSourceKind::NotAttempted
            }
        }
    }

    const fn append_request_expected(self) -> bool {
        matches!(
            self,
            Self::UncertainAfterEgress | Self::AttemptAborted | Self::NotAttemptedAfterEgress
        )
    }
}

struct ResolutionFixture {
    resolution: LocalLogStorageAppendResolution,
    snapshot: QueueSnapshot,
    source_attempt_id: LocalLogStorageAppendAttemptId,
    source_append_request_id: Option<LocalLogStorageAppendRequestId>,
}

fn make_queue(with_follower: bool) -> TestResult<LocalLogStorageAppendQueue> {
    let (_, queue, _) = queue(
        LocalLogStorageSelectionKind::Rotation,
        "replay:append-resolution:head",
        RESOLUTION_SENTINEL,
        LocalLogStorageAppendQueueLimits::new(4, u64::MAX),
    )?;
    if !with_follower {
        return Ok(queue);
    }

    let follower = insertion_entry(
        queue.speculative_cursor(),
        "replay:append-resolution:follower",
        "append-resolution-follower",
    )?;
    Ok(queue.try_enqueue(&follower)?.into_queue())
}

fn resolution_fixture(case: SourceCase, with_follower: bool) -> TestResult<ResolutionFixture> {
    let queue = make_queue(with_follower)?;
    let snapshot = QueueSnapshot::capture(&queue);
    let mut attempt = queue.begin_head_append_attempt();
    let source_attempt_id = attempt.attempt_id().clone();

    let (resolution, source_append_request_id) = match case {
        SourceCase::UncertainBeforeEgress => (attempt.begin_append_resolution(), None),
        SourceCase::UncertainAfterEgress => {
            let request_id = attempt.adapter_request()?.request_id().clone();
            (attempt.begin_append_resolution(), Some(request_id))
        }
        SourceCase::AttemptAborted => {
            let request_id = attempt.adapter_request()?.request_id().clone();
            let outcome = attempt.observe_terminal_attestation(
                LocalLogStorageAppendTerminalAttestation::transaction_aborted(&request_id),
            )?;
            let LocalLogStorageAppendTerminalOutcome::AttemptAborted(aborted) = outcome else {
                return Err("append abort did not produce the aborted resolver source".into());
            };
            (aborted.begin_append_resolution(), Some(request_id))
        }
        SourceCase::NotAttemptedBeforeEgress | SourceCase::NotAttemptedAfterEgress => {
            let request_id = if matches!(case, SourceCase::NotAttemptedAfterEgress) {
                Some(attempt.adapter_request()?.request_id().clone())
            } else {
                None
            };
            let outcome = attempt.observe_terminal_attestation(
                LocalLogStorageAppendTerminalAttestation::not_attempted(&source_attempt_id),
            )?;
            let LocalLogStorageAppendTerminalOutcome::NotAttempted(not_attempted) = outcome else {
                return Err(
                    "not-attempted terminal event produced the wrong resolver source".into()
                );
            };
            (not_attempted.begin_append_resolution(), request_id)
        }
    };

    Ok(ResolutionFixture { resolution, snapshot, source_attempt_id, source_append_request_id })
}

fn matching_selected() -> TestResult<LocalLogStorageSelectedRoot> {
    Ok(SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?.selected)
}

fn exact_current(
    resolution: &LocalLogStorageAppendResolution,
) -> TestResult<LocalLogStorageAppendResolutionCurrentObservation> {
    let selected = matching_selected()?;
    assert_eq!(selected.binding(), resolution.selected_binding());
    Ok(LocalLogStorageAppendResolutionCurrentObservation::new(
        selected,
        resolution.expected_binding().writer_epoch(),
        resolution.expected_binding().current_writer_fence_id().clone(),
        resolution.expected_binding().current_receipt().transaction_id().clone(),
    ))
}

fn current_with_writer(
    resolution: &LocalLogStorageAppendResolution,
    writer_epoch: crate::local_log::LocalLogStorageWriterEpoch,
    writer_fence_id: LocalLogStorageFenceId,
) -> TestResult<LocalLogStorageAppendResolutionCurrentObservation> {
    let selected = matching_selected()?;
    assert_eq!(selected.binding(), resolution.selected_binding());
    Ok(LocalLogStorageAppendResolutionCurrentObservation::new(
        selected,
        writer_epoch,
        writer_fence_id,
        resolution.expected_binding().current_receipt().transaction_id().clone(),
    ))
}

fn foreign_current(
    kind: LocalLogStorageSelectionKind,
) -> TestResult<LocalLogStorageAppendResolutionCurrentObservation> {
    let selected = SelectedRotationFixture::new(kind)?.selected;
    let transaction_id = selected.transaction_id().clone();
    Ok(LocalLogStorageAppendResolutionCurrentObservation::new(
        selected,
        crate::local_log::LocalLogStorageWriterEpoch::try_new(991)?,
        LocalLogStorageFenceId::try_new("fence:append-resolution-foreign")?,
        transaction_id,
    ))
}

fn foreign_current_with_writer(
    kind: LocalLogStorageSelectionKind,
    writer_epoch: crate::local_log::LocalLogStorageWriterEpoch,
    writer_fence_id: LocalLogStorageFenceId,
) -> TestResult<LocalLogStorageAppendResolutionCurrentObservation> {
    let selected = SelectedRotationFixture::new(kind)?.selected;
    let transaction_id = selected.transaction_id().clone();
    Ok(LocalLogStorageAppendResolutionCurrentObservation::new(
        selected,
        writer_epoch,
        writer_fence_id,
        transaction_id,
    ))
}

fn exact_head_bytes(resolution: &LocalLogStorageAppendResolution) -> Box<[u8]> {
    resolution.source.queue().head_frame().as_ref().to_vec().into_boxed_slice()
}

fn completed(
    mut resolution: LocalLogStorageAppendResolution,
    observation: LocalLogStorageAppendResolutionObservation,
) -> TestResult<(LocalLogStorageAppendResolutionOutcome, LocalLogStorageAppendResolutionRequestId)>
{
    let request_id = resolution.adapter_request()?.request_id().clone();
    let evidence =
        LocalLogStorageAppendResolutionEvidence::transaction_completed(&request_id, observation);
    let outcome =
        resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("exactly correlated append-resolution evidence was rejected: {failure:?}")
                .into()
        })?;
    Ok((outcome, request_id))
}

fn exact_absence(
    resolution: &LocalLogStorageAppendResolution,
) -> TestResult<LocalLogStorageAppendResolutionObservation> {
    Ok(LocalLogStorageAppendResolutionObservation::head_absent_at_tail(
        LocalLogStorageAppendResolutionHeadAbsentAtTailObservation::new(
            exact_current(resolution)?,
            resolution.head_chunk_start().get(),
        ),
    ))
}

fn exact_final(
    resolution: &LocalLogStorageAppendResolution,
) -> TestResult<LocalLogStorageAppendResolutionObservation> {
    Ok(LocalLogStorageAppendResolutionObservation::head_record_final(
        LocalLogStorageAppendResolutionHeadRecordFinalObservation::new(
            exact_current(resolution)?,
            resolution.head_chunk_start(),
            exact_head_bytes(resolution),
            resolution.head_chunk_start().get(),
        ),
    ))
}

fn collision_reason(
    outcome: LocalLogStorageAppendResolutionOutcome,
) -> TestResult<LocalLogStorageAppendResolutionCollisionReason> {
    let LocalLogStorageAppendResolutionOutcome::CollisionOrCorruption(resolved) = outcome else {
        return Err("invalid append-resolution finding did not fail closed".into());
    };
    resolved
        .collision_reason()
        .ok_or_else(|| "append collision outcome omitted its bounded reason".into())
}

fn assert_redacted(debug: &str) {
    assert!(!debug.contains(RESOLUTION_SENTINEL));
    assert!(!debug.contains(FRAME_SENTINEL));
    assert!(!debug.contains(SELECTION_SENTINEL));
}

fn replace_receipt_scope(
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

fn selected_with_replaced_scope() -> TestResult<LocalLogStorageSelectedRoot> {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let current_json = fixture.selected.current_selection_json().to_owned();
    let predecessor_json = fixture
        .selected
        .predecessor_selection_json()
        .ok_or("rotation replacement fixture omitted its predecessor")?
        .to_owned();
    let selected = fixture.selected.binding().clone();
    let scope_incarnation =
        LocalLogStorageScopeIncarnationId::try_new("scope-incarnation:append-resolution-replaced")?;
    let current = replace_receipt_scope(selected.current_receipt(), &scope_incarnation)?;
    let predecessor = selected
        .predecessor_receipt()
        .map(|receipt| replace_receipt_scope(receipt, &scope_incarnation))
        .transpose()?;
    let rebound = LocalLogStorageSelectedBinding::try_new(
        current,
        predecessor,
        selected.checkpoint_generation().clone(),
        selected.active_generation().clone(),
    )?;
    Ok(LocalLogStorageSelectedJsonCodec::new(fixture.context, rebound)
        .normalize_rotation(&current_json, &predecessor_json)?)
}

#[test]
fn every_source_preserves_exact_queue_ids_and_borrowed_request_metadata() -> TestResult {
    for case in SourceCase::ALL {
        let ResolutionFixture {
            mut resolution,
            snapshot,
            source_attempt_id,
            source_append_request_id,
        } = resolution_fixture(case, true)?;

        assert_eq!(resolution.source_kind(), case.kind());
        assert_eq!(resolution.source_attempt_id(), &source_attempt_id);
        assert_eq!(resolution.source_append_request_id(), source_append_request_id.as_ref());
        assert_eq!(source_append_request_id.is_some(), case.append_request_expected());
        assert!(!resolution.request_issued());
        snapshot.assert_queue(resolution.queue());
        assert_redacted(&format!("{resolution:?}"));

        let expected_binding = resolution.expected_binding().clone();
        let selected_binding = resolution.selected_binding().clone();
        let expected_frame_limits = selected_binding.active_generation().frame().limits();
        let head_chunk_start = resolution.head_chunk_start();
        let head_frame_end = resolution.head_frame_end();
        let head_frame_bytes = resolution.head_frame_bytes();

        let resolution_request_id = {
            let request = resolution.adapter_request()?;
            assert_eq!(request.source_kind(), case.kind());
            assert_eq!(request.source_attempt_id(), &source_attempt_id);
            assert_eq!(request.source_append_request_id(), source_append_request_id.as_ref());
            assert_eq!(request.expected_binding(), &expected_binding);
            assert_eq!(request.selected_binding(), &selected_binding);
            assert_eq!(request.expected_writer_epoch(), expected_binding.writer_epoch());
            assert_eq!(
                request.expected_writer_fence_id(),
                expected_binding.current_writer_fence_id()
            );
            assert_eq!(request.expected_frame_limits(), expected_frame_limits);
            assert_eq!(request.head_chunk_start(), head_chunk_start);
            assert_eq!(request.head_frame_end(), head_frame_end);
            assert_eq!(request.head_frame_bytes(), head_frame_bytes);
            assert_eq!(
                request.current_selection_json_bytes(),
                expected_binding.current_selection_json_bytes()
            );
            assert_eq!(
                request.predecessor_selection_json_bytes(),
                expected_binding.predecessor_selection_json_bytes()
            );
            assert_redacted(&format!("{request:?}"));
            request.request_id().clone()
        };
        assert!(resolution.request_issued());
        let error = resolution
            .adapter_request()
            .err()
            .ok_or("one resolver invocation unexpectedly emitted a second request")?;
        assert_eq!(error, LocalLogStorageAppendResolutionTransitionError::RequestAlreadyIssued);
        assert_ne!(format!("{resolution_request_id:?}"), RESOLUTION_SENTINEL);
        snapshot.assert_queue(resolution.queue());
    }
    Ok(())
}

#[test]
fn pre_egress_mismatch_precedence_restart_and_stale_evidence_are_fail_closed() -> TestResult {
    let ResolutionFixture { resolution, snapshot, source_attempt_id, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, true)?;
    let mut foreign = resolution_fixture(SourceCase::NotAttemptedBeforeEgress, false)?.resolution;
    let foreign_request_id = foreign.adapter_request()?.request_id().clone();
    let evidence = LocalLogStorageAppendResolutionEvidence::transaction_completed(
        &foreign_request_id,
        LocalLogStorageAppendResolutionObservation::empty_database_without_profile_record(),
    );

    let failure = resolution
        .apply_resolution_evidence(evidence)
        .err()
        .ok_or("pre-egress resolution evidence was accepted")?;
    assert_eq!(
        failure.code(),
        LocalLogStorageAppendResolutionTransitionErrorCode::RequestNotIssued
    );
    assert_eq!(failure.error(), &LocalLogStorageAppendResolutionTransitionError::RequestNotIssued);
    assert_eq!(failure.resolution().source_attempt_id(), &source_attempt_id);
    assert_eq!(failure.evidence().request_id(), &foreign_request_id);
    snapshot.assert_queue(failure.resolution().queue());
    assert_redacted(&format!("{failure:?} {failure}"));
    let (mut resolution, early_evidence, _) = failure.into_parts();

    let first_request_id = resolution.adapter_request()?.request_id().clone();
    let failure = resolution
        .apply_resolution_evidence(early_evidence)
        .err()
        .ok_or("foreign pre-egress evidence was laundered after request issue")?;
    assert_eq!(
        failure.code(),
        LocalLogStorageAppendResolutionTransitionErrorCode::RequestIdMismatch
    );
    snapshot.assert_queue(failure.resolution().queue());
    let (resolution, _, _) = failure.into_parts();

    let stale = LocalLogStorageAppendResolutionEvidence::transaction_completed(
        &first_request_id,
        LocalLogStorageAppendResolutionObservation::expected_scope_absent(),
    );
    let mut restarted = resolution.restart_resolution();
    assert!(!restarted.request_issued());
    assert_eq!(restarted.source_attempt_id(), &source_attempt_id);
    snapshot.assert_queue(restarted.queue());
    let second_request_id = restarted.adapter_request()?.request_id().clone();
    assert_ne!(second_request_id, first_request_id);

    let failure = restarted
        .apply_resolution_evidence(stale)
        .err()
        .ok_or("stale evidence from a superseded resolver invocation was accepted")?;
    assert_eq!(
        failure.code(),
        LocalLogStorageAppendResolutionTransitionErrorCode::RequestIdMismatch
    );
    let resolution = failure.into_resolution();
    let fresh = LocalLogStorageAppendResolutionEvidence::transaction_completed(
        &second_request_id,
        LocalLogStorageAppendResolutionObservation::expected_scope_absent(),
    );
    let outcome =
        resolution.apply_resolution_evidence(fresh).map_err(|failure| -> Box<dyn Error> {
            format!("fresh resolver evidence failed: {failure:?}").into()
        })?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageAppendResolutionOutcomeKind::StorageResetOrIndeterminate
    );
    Ok(())
}

#[test]
fn clean_exact_absence_grants_only_fresh_allocation_preserving_resubmission() -> TestResult {
    for case in SourceCase::ALL {
        let ResolutionFixture { resolution, snapshot, source_attempt_id, source_append_request_id } =
            resolution_fixture(case, true)?;
        let observation = exact_absence(&resolution)?;
        let (outcome, resolution_request_id) = completed(resolution, observation)?;
        assert_eq!(
            outcome.kind(),
            LocalLogStorageAppendResolutionOutcomeKind::RetryEligibleAtResolution
        );
        let LocalLogStorageAppendResolutionOutcome::RetryEligibleAtResolution(retry) = outcome
        else {
            return Err("clean exact absence returned the wrong payload".into());
        };
        assert_eq!(retry.source_kind(), case.kind());
        assert_eq!(retry.source_attempt_id(), &source_attempt_id);
        assert_eq!(retry.source_append_request_id(), source_append_request_id.as_ref());
        assert_eq!(retry.resolution_request_id(), &resolution_request_id);
        snapshot.assert_queue(retry.queue());
        assert_redacted(&format!("{retry:?}"));

        let mut resubmission = retry.begin_exact_resubmission();
        assert_ne!(resubmission.attempt_id(), &source_attempt_id);
        assert!(!resubmission.request_issued());
        snapshot.assert_attempt(&resubmission);
        let fresh_request_id = resubmission.adapter_request()?.request_id().clone();
        assert_ne!(fresh_request_id.attempt_id(), &source_attempt_id);
        snapshot.assert_attempt(&resubmission);
    }
    Ok(())
}

#[test]
fn enqueue_during_resolution_preserves_head_source_and_emitted_resolver_correlation() -> TestResult
{
    let ResolutionFixture { mut resolution, source_attempt_id, source_append_request_id, .. } =
        resolution_fixture(SourceCase::AttemptAborted, false)?;
    let head_pointer = resolution.source.queue().head_frame().as_ptr();
    let head_start = resolution.head_chunk_start();
    let original_frames = resolution.queue().pending_frames();
    let original_bytes = resolution.queue().pending_bytes();
    let resolver_request_id = resolution.adapter_request()?.request_id().clone();
    let follower = insertion_entry(
        resolution.queue().speculative_cursor(),
        "replay:append-resolution:enqueued-during-probe",
        "enqueued-during-append-resolution",
    )?;

    let step = resolution.try_enqueue(&follower)?;
    assert_eq!(
        step.owner().source_kind(),
        LocalLogStorageAppendResolutionSourceKind::AttemptAborted
    );
    assert_eq!(step.owner().source_attempt_id(), &source_attempt_id);
    assert_eq!(step.owner().source_append_request_id(), source_append_request_id.as_ref());
    assert!(step.owner().request_issued());
    assert_eq!(
        step.chunk_start().get(),
        head_start.get() + u64::try_from(step.owner().queue().head_frame_bytes())?
    );
    assert_eq!(step.frame_end(), step.chunk_start().get() + u64::try_from(step.frame_bytes())?);
    assert_eq!(step.owner().source.queue().head_frame().as_ptr(), head_pointer);
    assert_eq!(step.owner().queue().pending_frames(), original_frames + 1);
    assert_eq!(
        step.owner().queue().pending_bytes(),
        original_bytes + u64::try_from(step.frame_bytes())?
    );
    assert_redacted(&format!("{step:?}"));
    let resolution = step.into_owner();
    let evidence = LocalLogStorageAppendResolutionEvidence::transaction_completed(
        &resolver_request_id,
        exact_absence(&resolution)?,
    );
    let outcome =
        resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("enqueue lost emitted resolver correlation: {failure:?}").into()
        })?;
    let LocalLogStorageAppendResolutionOutcome::RetryEligibleAtResolution(retry) = outcome else {
        return Err("enqueue changed clean-absence classification for the immutable head".into());
    };
    assert_eq!(retry.resolution_request_id(), &resolver_request_id);
    assert_eq!(retry.queue().pending_frames(), original_frames + 1);

    let (_, queue, _) = queue(
        LocalLogStorageSelectionKind::Rotation,
        "replay:append-resolution:capacity-head",
        RESOLUTION_SENTINEL,
        LocalLogStorageAppendQueueLimits::new(1, u64::MAX),
    )?;
    let snapshot = QueueSnapshot::capture(&queue);
    let attempt = queue.begin_head_append_attempt();
    let attempt_id = attempt.attempt_id().clone();
    let outcome = attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::not_attempted(&attempt_id),
    )?;
    let LocalLogStorageAppendTerminalOutcome::NotAttempted(not_attempted) = outcome else {
        return Err("capacity fixture did not enter not-attempted state".into());
    };
    let mut resolution = not_attempted.begin_append_resolution();
    let request_id = resolution.adapter_request()?.request_id().clone();
    let follower = insertion_entry(
        resolution.queue().speculative_cursor(),
        "replay:append-resolution:capacity-follower",
        "capacity-follower",
    )?;
    let failure = resolution
        .try_enqueue(&follower)
        .err()
        .ok_or("over-capacity resolver enqueue unexpectedly succeeded")?;
    assert_eq!(failure.code(), LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameLimit);
    assert_eq!(failure.owner().source_attempt_id(), &attempt_id);
    assert!(failure.owner().request_issued());
    snapshot.assert_queue(failure.owner().queue());
    assert_redacted(&format!("{failure:?} {failure}"));
    let resolution = failure.into_owner();
    let outcome = resolution
        .apply_resolution_evidence(LocalLogStorageAppendResolutionEvidence::transaction_completed(
            &request_id,
            LocalLogStorageAppendResolutionObservation::expected_scope_absent(),
        ))
        .map_err(|failure| -> Box<dyn Error> {
            format!("failed enqueue lost resolver request identity: {failure:?}").into()
        })?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageAppendResolutionOutcomeKind::StorageResetOrIndeterminate
    );
    Ok(())
}

#[test]
fn exact_final_is_distinct_and_explicit_ack_removes_exactly_one_head() -> TestResult {
    let ResolutionFixture { resolution, snapshot, source_attempt_id, source_append_request_id } =
        resolution_fixture(SourceCase::NotAttemptedBeforeEgress, true)?;
    assert_eq!(source_append_request_id, None);
    let head_start = resolution.head_chunk_start();
    let head_end = resolution.head_frame_end();
    let head_bytes = resolution.head_frame_bytes();
    let head_observation = resolution.queue().head_observation_outcome();
    let pending_frames = resolution.queue().pending_frames();
    let pending_bytes = resolution.queue().pending_bytes();
    let follower_pointer = resolution.queue().follower_frame_pointers()[0];
    let observation = exact_final(&resolution)?;
    let (outcome, resolution_request_id) = completed(resolution, observation)?;
    assert_eq!(outcome.kind(), LocalLogStorageAppendResolutionOutcomeKind::HeadPresentAtResolution);
    let LocalLogStorageAppendResolutionOutcome::HeadPresentAtResolution(present) = outcome else {
        return Err("exact final head did not produce resolution-positive presence".into());
    };
    assert_eq!(present.source_kind(), LocalLogStorageAppendResolutionSourceKind::NotAttempted);
    assert_eq!(present.source_attempt_id(), &source_attempt_id);
    assert_eq!(present.source_append_request_id(), None);
    assert_eq!(present.resolution_request_id(), &resolution_request_id);
    snapshot.assert_queue(present.queue());
    assert_redacted(&format!("{present:?}"));

    let acknowledgement = present.acknowledge_head();
    let LocalLogStorageAppendResolutionHeadAcknowledgementOutcome::Pending(pending) =
        acknowledgement
    else {
        return Err("acknowledging the first of two resolved heads drained the queue".into());
    };
    assert_eq!(pending.resolution_request_id(), &resolution_request_id);
    assert_eq!(pending.source_kind(), LocalLogStorageAppendResolutionSourceKind::NotAttempted);
    assert_eq!(pending.source_attempt_id(), &source_attempt_id);
    assert_eq!(pending.source_append_request_id(), None);
    assert_eq!(pending.acknowledged_head_chunk_start(), head_start);
    assert_eq!(pending.acknowledged_head_frame_end(), head_end);
    assert_eq!(pending.acknowledged_head_frame_bytes(), head_bytes);
    assert_eq!(pending.acknowledged_head_observation_outcome(), head_observation);
    assert_eq!(pending.queue().head_frame().as_ptr(), follower_pointer);
    assert_eq!(pending.queue().pending_frames(), pending_frames - 1);
    assert_eq!(pending.queue().pending_bytes(), pending_bytes - u64::try_from(head_bytes)?);
    assert_redacted(&format!("{pending:?}"));

    let ResolutionFixture { resolution, source_attempt_id, source_append_request_id, .. } =
        resolution_fixture(SourceCase::AttemptAborted, false)?;
    let final_cursor = resolution.queue().speculative_tail_end();
    let token_request_id = resolution.queue().token().request_id().clone();
    let limits = resolution.queue().limits();
    let observation = exact_final(&resolution)?;
    let (outcome, resolution_request_id) = completed(resolution, observation)?;
    let LocalLogStorageAppendResolutionOutcome::HeadPresentAtResolution(present) = outcome else {
        return Err("single exact final head did not become present".into());
    };
    let acknowledgement = present.acknowledge_head();
    let LocalLogStorageAppendResolutionHeadAcknowledgementOutcome::Drained(drained) =
        acknowledgement
    else {
        return Err("single resolution-acknowledged head did not drain".into());
    };
    assert_eq!(drained.resolution_request_id(), &resolution_request_id);
    assert_eq!(drained.source_kind(), LocalLogStorageAppendResolutionSourceKind::AttemptAborted);
    assert_eq!(drained.source_attempt_id(), &source_attempt_id);
    assert_eq!(drained.source_append_request_id(), source_append_request_id.as_ref());
    assert_eq!(drained.token().request_id(), &token_request_id);
    assert_eq!(drained.final_cursor().accepted_byte_offset(), final_cursor);
    assert_eq!(drained.limits(), limits);
    assert_redacted(&format!("{drained:?}"));
    Ok(())
}

#[test]
fn writer_pair_advance_allows_exact_final_but_forbids_absent_retry() -> TestResult {
    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainAfterEgress, false)?;
    let advanced_epoch = resolution.expected_binding().writer_epoch().successor()?;
    let advanced = current_with_writer(
        &resolution,
        advanced_epoch,
        LocalLogStorageFenceId::try_new("fence:append-resolution-advanced-final")?,
    )?;
    let observation = LocalLogStorageAppendResolutionObservation::head_record_final(
        LocalLogStorageAppendResolutionHeadRecordFinalObservation::new(
            advanced,
            resolution.head_chunk_start(),
            exact_head_bytes(&resolution),
            resolution.head_chunk_start().get(),
        ),
    );
    let (outcome, _) = completed(resolution, observation)?;
    assert_eq!(outcome.kind(), LocalLogStorageAppendResolutionOutcomeKind::HeadPresentAtResolution);

    let ResolutionFixture { resolution, snapshot, .. } =
        resolution_fixture(SourceCase::UncertainAfterEgress, false)?;
    let advanced_epoch = resolution.expected_binding().writer_epoch().successor()?;
    let advanced = current_with_writer(
        &resolution,
        advanced_epoch,
        LocalLogStorageFenceId::try_new("fence:append-resolution-advanced-absent")?,
    )?;
    let observation = LocalLogStorageAppendResolutionObservation::head_absent_at_tail(
        LocalLogStorageAppendResolutionHeadAbsentAtTailObservation::new(
            advanced,
            resolution.head_chunk_start().get(),
        ),
    );
    let (outcome, _) = completed(resolution, observation)?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageAppendResolutionOutcomeKind::TailAdvancedOrIndeterminate
    );
    let LocalLogStorageAppendResolutionOutcome::TailAdvancedOrIndeterminate(resolved) = outcome
    else {
        return Err("writer-advanced absence returned retry authority".into());
    };
    snapshot.assert_queue(resolved.queue());
    assert_eq!(resolved.collision_reason(), None);
    Ok(())
}

#[test]
fn writer_advance_does_not_mask_invalid_tail_facts() -> TestResult {
    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainAfterEgress, false)?;
    let advanced = current_with_writer(
        &resolution,
        resolution.expected_binding().writer_epoch().successor()?,
        LocalLogStorageFenceId::try_new("fence:advanced-invalid-prefix")?,
    )?;
    let observation = LocalLogStorageAppendResolutionObservation::head_absent_at_tail(
        LocalLogStorageAppendResolutionHeadAbsentAtTailObservation::new(
            advanced,
            resolution.head_chunk_start().get() + 1,
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::HeadAbsentPrefixEndMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainAfterEgress, false)?;
    let advanced = current_with_writer(
        &resolution,
        resolution.expected_binding().writer_epoch().successor()?,
        LocalLogStorageFenceId::try_new("fence:advanced-gap")?,
    )?;
    let observation = LocalLogStorageAppendResolutionObservation::later_record_observed(
        LocalLogStorageAppendResolutionLaterRecordObservation::new(
            advanced,
            LocalLogStorageAppendResolutionLaterTargetObservation::absent(
                resolution.head_chunk_start().get(),
            ),
            LocalLogStorageChunkStart::new(resolution.head_frame_end() + 1),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::LaterRecordAfterAbsentHead
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainAfterEgress, false)?;
    let advanced = current_with_writer(
        &resolution,
        resolution.expected_binding().writer_epoch().successor()?,
        LocalLogStorageFenceId::try_new("fence:advanced-wrong-target")?,
    )?;
    let mut different = exact_head_bytes(&resolution).into_vec();
    different[0] ^= 1;
    let observation = LocalLogStorageAppendResolutionObservation::later_record_observed(
        LocalLogStorageAppendResolutionLaterRecordObservation::new(
            advanced,
            LocalLogStorageAppendResolutionLaterTargetObservation::present(
                resolution.head_chunk_start(),
                different.into_boxed_slice(),
                resolution.head_chunk_start().get(),
            ),
            LocalLogStorageChunkStart::new(resolution.head_frame_end()),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::HeadFrameBytesMismatch
    );
    Ok(())
}

#[test]
fn writer_regression_fence_substitution_and_false_context_change_fail_closed() -> TestResult {
    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let expected_epoch = resolution.expected_binding().writer_epoch();
    let regressed_epoch = crate::local_log::LocalLogStorageWriterEpoch::try_new(
        expected_epoch.get().checked_sub(1).ok_or("test writer epoch cannot regress")?,
    )?;
    let current = current_with_writer(
        &resolution,
        regressed_epoch,
        resolution.expected_binding().current_writer_fence_id().clone(),
    )?;
    let observation = LocalLogStorageAppendResolutionObservation::head_record_final(
        LocalLogStorageAppendResolutionHeadRecordFinalObservation::new(
            current,
            resolution.head_chunk_start(),
            exact_head_bytes(&resolution),
            resolution.head_chunk_start().get(),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::WriterEpochRegression
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let current = current_with_writer(
        &resolution,
        resolution.expected_binding().writer_epoch(),
        LocalLogStorageFenceId::try_new("fence:append-resolution-same-epoch-substitution")?,
    )?;
    let observation = LocalLogStorageAppendResolutionObservation::head_absent_at_tail(
        LocalLogStorageAppendResolutionHeadAbsentAtTailObservation::new(
            current,
            resolution.head_chunk_start().get(),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::CurrentWriterFenceMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let current = foreign_current_with_writer(
        LocalLogStorageSelectionKind::Root,
        resolution.expected_binding().writer_epoch(),
        resolution.expected_binding().current_writer_fence_id().clone(),
    )?;
    assert_ne!(
        current.binding().current_receipt(),
        resolution.expected_binding().current_receipt()
    );
    let observation = LocalLogStorageAppendResolutionObservation::current_context_changed(current);
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::SelectionChangedWithoutWriterAdvance
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let observation = LocalLogStorageAppendResolutionObservation::current_context_changed(
        exact_current(&resolution)?,
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::CurrentContextReportedUnchanged
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let replaced = selected_with_replaced_scope()?;
    let replaced_transaction_id = replaced.transaction_id().clone();
    let observation = LocalLogStorageAppendResolutionObservation::current_context_changed(
        LocalLogStorageAppendResolutionCurrentObservation::new(
            replaced,
            resolution.expected_binding().writer_epoch(),
            resolution.expected_binding().current_writer_fence_id().clone(),
            replaced_transaction_id,
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::CurrentContextLifetimeMismatch
    );
    Ok(())
}

#[test]
fn changed_selection_or_current_context_is_indeterminate_without_authority() -> TestResult {
    let ResolutionFixture { resolution, snapshot, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, true)?;
    let observation = LocalLogStorageAppendResolutionObservation::current_context_changed(
        foreign_current(LocalLogStorageSelectionKind::Root)?,
    );
    let (outcome, _) = completed(resolution, observation)?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageAppendResolutionOutcomeKind::TailAdvancedOrIndeterminate
    );
    let LocalLogStorageAppendResolutionOutcome::TailAdvancedOrIndeterminate(resolved) = outcome
    else {
        return Err("changed current context produced authority".into());
    };
    snapshot.assert_queue(resolved.queue());

    let ResolutionFixture { resolution, snapshot, .. } =
        resolution_fixture(SourceCase::NotAttemptedAfterEgress, true)?;
    let observation = LocalLogStorageAppendResolutionObservation::head_absent_at_tail(
        LocalLogStorageAppendResolutionHeadAbsentAtTailObservation::new(
            foreign_current(LocalLogStorageSelectionKind::Root)?,
            resolution.head_chunk_start().get(),
        ),
    );
    let (outcome, _) = completed(resolution, observation)?;
    let LocalLogStorageAppendResolutionOutcome::TailAdvancedOrIndeterminate(resolved) = outcome
    else {
        return Err("foreign selected context granted absent-head retry".into());
    };
    snapshot.assert_queue(resolved.queue());
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn malformed_head_and_later_record_facts_map_to_exact_collision_reasons() -> TestResult {
    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let wrong_transaction =
        LocalLogStorageTransactionId::try_new("transaction:append-resolution-wrong-head-index")?;
    let current = LocalLogStorageAppendResolutionCurrentObservation::new(
        matching_selected()?,
        resolution.expected_binding().writer_epoch(),
        resolution.expected_binding().current_writer_fence_id().clone(),
        wrong_transaction,
    );
    let observation = LocalLogStorageAppendResolutionObservation::head_absent_at_tail(
        LocalLogStorageAppendResolutionHeadAbsentAtTailObservation::new(
            current,
            resolution.head_chunk_start().get(),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::CurrentHeadIndexMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let observation = LocalLogStorageAppendResolutionObservation::head_absent_at_tail(
        LocalLogStorageAppendResolutionHeadAbsentAtTailObservation::new(
            exact_current(&resolution)?,
            resolution.head_chunk_start().get() + 1,
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::HeadAbsentPrefixEndMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let observation = LocalLogStorageAppendResolutionObservation::head_record_final(
        LocalLogStorageAppendResolutionHeadRecordFinalObservation::new(
            exact_current(&resolution)?,
            LocalLogStorageChunkStart::new(resolution.head_chunk_start().get() + 1),
            exact_head_bytes(&resolution),
            resolution.head_chunk_start().get(),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::HeadChunkStartMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let observation = LocalLogStorageAppendResolutionObservation::head_record_final(
        LocalLogStorageAppendResolutionHeadRecordFinalObservation::new(
            exact_current(&resolution)?,
            resolution.head_chunk_start(),
            exact_head_bytes(&resolution),
            resolution.head_chunk_start().get() + 1,
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::HeadPrefixBeforeTargetMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let mut short = exact_head_bytes(&resolution).into_vec();
    short.pop().ok_or("append-resolution head frame was unexpectedly empty")?;
    let observation = LocalLogStorageAppendResolutionObservation::head_record_final(
        LocalLogStorageAppendResolutionHeadRecordFinalObservation::new(
            exact_current(&resolution)?,
            resolution.head_chunk_start(),
            short.into_boxed_slice(),
            resolution.head_chunk_start().get(),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::HeadFrameEndMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let mut different = exact_head_bytes(&resolution).into_vec();
    different[0] ^= 1;
    let observation = LocalLogStorageAppendResolutionObservation::head_record_final(
        LocalLogStorageAppendResolutionHeadRecordFinalObservation::new(
            exact_current(&resolution)?,
            resolution.head_chunk_start(),
            different.into_boxed_slice(),
            resolution.head_chunk_start().get(),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::HeadFrameBytesMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let observation = LocalLogStorageAppendResolutionObservation::later_record_observed(
        LocalLogStorageAppendResolutionLaterRecordObservation::new(
            exact_current(&resolution)?,
            LocalLogStorageAppendResolutionLaterTargetObservation::absent(
                resolution.head_chunk_start().get() + 1,
            ),
            LocalLogStorageChunkStart::new(resolution.head_frame_end() + 1),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::HeadAbsentPrefixEndMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let observation = LocalLogStorageAppendResolutionObservation::later_record_observed(
        LocalLogStorageAppendResolutionLaterRecordObservation::new(
            exact_current(&resolution)?,
            LocalLogStorageAppendResolutionLaterTargetObservation::absent(
                resolution.head_chunk_start().get(),
            ),
            resolution.head_chunk_start(),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::LaterRecordOrderMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let observation = LocalLogStorageAppendResolutionObservation::later_record_observed(
        LocalLogStorageAppendResolutionLaterRecordObservation::new(
            exact_current(&resolution)?,
            LocalLogStorageAppendResolutionLaterTargetObservation::absent(
                resolution.head_chunk_start().get(),
            ),
            LocalLogStorageChunkStart::new(resolution.head_frame_end() + 1),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::LaterRecordAfterAbsentHead
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let observation = LocalLogStorageAppendResolutionObservation::later_record_observed(
        LocalLogStorageAppendResolutionLaterRecordObservation::new(
            exact_current(&resolution)?,
            LocalLogStorageAppendResolutionLaterTargetObservation::present(
                resolution.head_chunk_start(),
                exact_head_bytes(&resolution),
                resolution.head_chunk_start().get(),
            ),
            LocalLogStorageChunkStart::new(resolution.head_frame_end() + 1),
        ),
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::LaterRecordBoundaryMismatch
    );
    Ok(())
}

#[test]
fn exact_head_with_any_later_record_is_indeterminate_and_never_acknowledges() -> TestResult {
    let ResolutionFixture { resolution, snapshot, .. } =
        resolution_fixture(SourceCase::AttemptAborted, true)?;
    let target = LocalLogStorageAppendResolutionLaterTargetObservation::present(
        resolution.head_chunk_start(),
        exact_head_bytes(&resolution),
        resolution.head_chunk_start().get(),
    );
    assert!(target.is_present());
    assert_eq!(target.observed_frame_bytes(), Some(resolution.head_frame_bytes()));
    let observation = LocalLogStorageAppendResolutionObservation::later_record_observed(
        LocalLogStorageAppendResolutionLaterRecordObservation::new(
            exact_current(&resolution)?,
            target,
            LocalLogStorageChunkStart::new(resolution.head_frame_end()),
        ),
    );
    let (outcome, _) = completed(resolution, observation)?;
    assert_eq!(
        outcome.kind(),
        LocalLogStorageAppendResolutionOutcomeKind::TailAdvancedOrIndeterminate
    );
    let LocalLogStorageAppendResolutionOutcome::TailAdvancedOrIndeterminate(resolved) = outcome
    else {
        return Err("exact head followed by another record was acknowledged".into());
    };
    assert_eq!(
        resolved.observation_kind(),
        LocalLogStorageAppendResolutionObservationKind::LaterRecordObserved
    );
    assert_eq!(resolved.collision_reason(), None);
    snapshot.assert_queue(resolved.queue());
    assert_redacted(&format!("{resolved:?}"));
    Ok(())
}

#[test]
fn database_and_scope_lifetime_findings_are_reset_or_indeterminate() -> TestResult {
    let ResolutionFixture { mut resolution, snapshot, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, true)?;
    let request_id = resolution.adapter_request()?.request_id().clone();
    let evidence = LocalLogStorageAppendResolutionEvidence::database_open_absent(&request_id);
    assert_eq!(
        evidence.observation().kind(),
        LocalLogStorageAppendResolutionObservationKind::ExpectedDatabaseUnavailable
    );
    assert_redacted(&format!("{evidence:?}"));
    let outcome =
        resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("database absence failed: {failure:?}").into()
        })?;
    let LocalLogStorageAppendResolutionOutcome::StorageResetOrIndeterminate(resolved) = outcome
    else {
        return Err("physical database absence returned the wrong classification".into());
    };
    snapshot.assert_queue(resolved.queue());

    for observation in [
        LocalLogStorageAppendResolutionObservation::empty_database_without_profile_record(),
        LocalLogStorageAppendResolutionObservation::expected_scope_absent(),
    ] {
        let ResolutionFixture { resolution, snapshot, .. } =
            resolution_fixture(SourceCase::NotAttemptedBeforeEgress, true)?;
        let (outcome, _) = completed(resolution, observation)?;
        let LocalLogStorageAppendResolutionOutcome::StorageResetOrIndeterminate(resolved) = outcome
        else {
            return Err("database/scope absence returned the wrong classification".into());
        };
        snapshot.assert_queue(resolved.queue());
    }

    let ResolutionFixture { resolution, snapshot, .. } =
        resolution_fixture(SourceCase::UncertainAfterEgress, true)?;
    let other_incarnation =
        LocalLogStorageDatabaseIncarnationId::try_new("database:append-resolution-replaced")?;
    let (outcome, _) = completed(
        resolution,
        LocalLogStorageAppendResolutionObservation::expected_database_incarnation_mismatch(
            other_incarnation,
        ),
    )?;
    let LocalLogStorageAppendResolutionOutcome::StorageResetOrIndeterminate(resolved) = outcome
    else {
        return Err("database incarnation replacement returned the wrong classification".into());
    };
    snapshot.assert_queue(resolved.queue());

    let ResolutionFixture { resolution, snapshot, .. } =
        resolution_fixture(SourceCase::AttemptAborted, true)?;
    let replaced = selected_with_replaced_scope()?;
    let replaced_transaction_id = replaced.transaction_id().clone();
    let observation = LocalLogStorageAppendResolutionObservation::expected_scope_replaced(
        LocalLogStorageAppendResolutionCurrentObservation::new(
            replaced,
            resolution.expected_binding().writer_epoch(),
            resolution.expected_binding().current_writer_fence_id().clone(),
            replaced_transaction_id,
        ),
    );
    let (outcome, _) = completed(resolution, observation)?;
    let LocalLogStorageAppendResolutionOutcome::StorageResetOrIndeterminate(resolved) = outcome
    else {
        return Err("valid scope replacement returned the wrong classification".into());
    };
    snapshot.assert_queue(resolved.queue());
    Ok(())
}

#[test]
fn contradictory_unavailability_and_scope_replacement_claims_fail_closed() -> TestResult {
    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let expected_incarnation =
        resolution.expected_binding().current_receipt().database_incarnation_id().clone();
    let (outcome, _) = completed(
        resolution,
        LocalLogStorageAppendResolutionObservation::expected_database_incarnation_mismatch(
            expected_incarnation,
        ),
    )?;
    assert_eq!(
        collision_reason(outcome)?,
        LocalLogStorageAppendResolutionCollisionReason::ExpectedDatabaseObservationMismatch
    );

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, false)?;
    let observation = LocalLogStorageAppendResolutionObservation::expected_scope_replaced(
        exact_current(&resolution)?,
    );
    assert_eq!(
        collision_reason(completed(resolution, observation)?.0)?,
        LocalLogStorageAppendResolutionCollisionReason::ExpectedScopeObservationMismatch
    );
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn direct_defects_and_all_public_kind_and_code_spellings_are_stable() -> TestResult {
    let defects = [
        (LocalLogStorageAppendResolutionObservedDefect::ProfileMetadata, "profile_metadata"),
        (LocalLogStorageAppendResolutionObservedDefect::ScopeControl, "scope_control"),
        (
            LocalLogStorageAppendResolutionObservedDefect::SelectedTransaction,
            "selected_transaction",
        ),
        (
            LocalLogStorageAppendResolutionObservedDefect::SelectedCheckpointGeneration,
            "selected_checkpoint_generation",
        ),
        (
            LocalLogStorageAppendResolutionObservedDefect::SelectedActiveGeneration,
            "selected_active_generation",
        ),
        (LocalLogStorageAppendResolutionObservedDefect::WriterFenceRecord, "writer_fence_record"),
        (LocalLogStorageAppendResolutionObservedDefect::ChunkKeyOrOrder, "chunk_key_or_order"),
        (LocalLogStorageAppendResolutionObservedDefect::ChunkFrame, "chunk_frame"),
        (LocalLogStorageAppendResolutionObservedDefect::ChunkPrefix, "chunk_prefix"),
        (
            LocalLogStorageAppendResolutionObservedDefect::OrphanScopeArtifact,
            "orphan_scope_artifact",
        ),
    ];
    for (defect, spelling) in defects {
        assert_eq!(defect.as_str(), spelling);
        let ResolutionFixture { resolution, snapshot, .. } =
            resolution_fixture(SourceCase::UncertainBeforeEgress, true)?;
        let observation =
            LocalLogStorageAppendResolutionObservation::collision_or_broken_profile(defect);
        let (outcome, _) = completed(resolution, observation)?;
        let LocalLogStorageAppendResolutionOutcome::CollisionOrCorruption(resolved) = outcome
        else {
            return Err("direct adapter defect did not fail closed".into());
        };
        assert_eq!(
            resolved.collision_reason(),
            Some(
                LocalLogStorageAppendResolutionCollisionReason::ObservedCollisionOrBrokenProfile {
                    reason: defect,
                }
            )
        );
        snapshot.assert_queue(resolved.queue());
    }

    for (kind, spelling) in [
        (LocalLogStorageAppendResolutionSourceKind::Uncertain, "uncertain"),
        (LocalLogStorageAppendResolutionSourceKind::AttemptAborted, "attempt_aborted"),
        (LocalLogStorageAppendResolutionSourceKind::NotAttempted, "not_attempted"),
    ] {
        assert_eq!(kind.as_str(), spelling);
    }
    for (kind, spelling) in [
        (
            LocalLogStorageAppendResolutionObservationKind::ExpectedDatabaseUnavailable,
            "expected_database_unavailable",
        ),
        (
            LocalLogStorageAppendResolutionObservationKind::ExpectedScopeUnavailableOrReplaced,
            "expected_scope_unavailable_or_replaced",
        ),
        (
            LocalLogStorageAppendResolutionObservationKind::CurrentContextChanged,
            "current_context_changed",
        ),
        (LocalLogStorageAppendResolutionObservationKind::HeadAbsentAtTail, "head_absent_at_tail"),
        (LocalLogStorageAppendResolutionObservationKind::HeadRecordFinal, "head_record_final"),
        (
            LocalLogStorageAppendResolutionObservationKind::LaterRecordObserved,
            "later_record_observed",
        ),
        (
            LocalLogStorageAppendResolutionObservationKind::CollisionOrBrokenProfile,
            "collision_or_broken_profile",
        ),
    ] {
        assert_eq!(kind.as_str(), spelling);
    }
    for (kind, spelling) in [
        (
            LocalLogStorageAppendResolutionOutcomeKind::HeadPresentAtResolution,
            "head_present_at_resolution",
        ),
        (
            LocalLogStorageAppendResolutionOutcomeKind::RetryEligibleAtResolution,
            "retry_eligible_at_resolution",
        ),
        (
            LocalLogStorageAppendResolutionOutcomeKind::TailAdvancedOrIndeterminate,
            "tail_advanced_or_indeterminate",
        ),
        (
            LocalLogStorageAppendResolutionOutcomeKind::CollisionOrCorruption,
            "collision_or_corruption",
        ),
        (
            LocalLogStorageAppendResolutionOutcomeKind::StorageResetOrIndeterminate,
            "storage_reset_or_indeterminate",
        ),
    ] {
        assert_eq!(kind.as_str(), spelling);
    }
    for (code, spelling) in [
        (
            LocalLogStorageAppendResolutionTransitionErrorCode::RequestAlreadyIssued,
            "local_log_storage_append_resolution_transition.request_already_issued",
        ),
        (
            LocalLogStorageAppendResolutionTransitionErrorCode::RequestNotIssued,
            "local_log_storage_append_resolution_transition.request_not_issued",
        ),
        (
            LocalLogStorageAppendResolutionTransitionErrorCode::RequestIdMismatch,
            "local_log_storage_append_resolution_transition.request_id_mismatch",
        ),
    ] {
        assert_eq!(code.as_str(), spelling);
    }
    for (reason, spelling) in [
        (
            LocalLogStorageAppendResolutionCollisionReason::ExpectedDatabaseObservationMismatch,
            "local_log_storage_append_resolution.expected_database_observation_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::ExpectedScopeObservationMismatch,
            "local_log_storage_append_resolution.expected_scope_observation_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::CurrentHeadIndexMismatch,
            "local_log_storage_append_resolution.current_head_index_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::CurrentContextLifetimeMismatch,
            "local_log_storage_append_resolution.current_context_lifetime_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::SelectedEnvelopeMismatch,
            "local_log_storage_append_resolution.selected_envelope_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::CurrentSelectionBytesMismatch,
            "local_log_storage_append_resolution.current_selection_bytes_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::PredecessorSelectionBytesMismatch,
            "local_log_storage_append_resolution.predecessor_selection_bytes_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::WriterEpochRegression,
            "local_log_storage_append_resolution.writer_epoch_regression",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::SelectionChangedWithoutWriterAdvance,
            "local_log_storage_append_resolution.selection_changed_without_writer_advance",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::CurrentWriterFenceMismatch,
            "local_log_storage_append_resolution.current_writer_fence_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::CurrentContextReportedUnchanged,
            "local_log_storage_append_resolution.current_context_reported_unchanged",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::HeadAbsentPrefixEndMismatch,
            "local_log_storage_append_resolution.head_absent_prefix_end_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::HeadChunkStartMismatch,
            "local_log_storage_append_resolution.head_chunk_start_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::HeadPrefixBeforeTargetMismatch,
            "local_log_storage_append_resolution.head_prefix_before_target_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::HeadFrameEndMismatch,
            "local_log_storage_append_resolution.head_frame_end_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::HeadFrameBytesMismatch,
            "local_log_storage_append_resolution.head_frame_bytes_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::LaterRecordOrderMismatch,
            "local_log_storage_append_resolution.later_record_order_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::LaterRecordAfterAbsentHead,
            "local_log_storage_append_resolution.later_record_after_absent_head",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::LaterRecordBoundaryMismatch,
            "local_log_storage_append_resolution.later_record_boundary_mismatch",
        ),
        (
            LocalLogStorageAppendResolutionCollisionReason::ObservedCollisionOrBrokenProfile {
                reason: LocalLogStorageAppendResolutionObservedDefect::ChunkFrame,
            },
            "local_log_storage_append_resolution.observed_collision_or_broken_profile",
        ),
    ] {
        assert_eq!(reason.as_str(), spelling);
    }
    Ok(())
}

#[test]
fn debug_of_resolution_evidence_failures_and_all_payload_owners_is_redacted() -> TestResult {
    let ResolutionFixture { mut resolution, .. } =
        resolution_fixture(SourceCase::NotAttemptedBeforeEgress, true)?;
    assert_redacted(&format!("{resolution:?}"));
    let expected_head = exact_head_bytes(&resolution);
    let evidence = {
        let request = resolution.adapter_request()?;
        assert_redacted(&format!("{request:?}"));
        let observation = LocalLogStorageAppendResolutionObservation::head_record_final(
            LocalLogStorageAppendResolutionHeadRecordFinalObservation::new(
                {
                    let selected = matching_selected()?;
                    let transaction_id = selected.transaction_id().clone();
                    LocalLogStorageAppendResolutionCurrentObservation::new(
                        selected,
                        request.expected_writer_epoch(),
                        request.expected_writer_fence_id().clone(),
                        transaction_id,
                    )
                },
                request.head_chunk_start(),
                expected_head,
                request.head_chunk_start().get(),
            ),
        );
        LocalLogStorageAppendResolutionEvidence::transaction_completed(
            request.request_id(),
            observation,
        )
    };
    assert_redacted(&format!("{evidence:?}"));

    let mut wrong = resolution_fixture(SourceCase::UncertainBeforeEgress, true)?.resolution;
    let _wrong_request_id = wrong.adapter_request()?.request_id().clone();
    let failure = wrong
        .apply_resolution_evidence(evidence)
        .err()
        .ok_or("cross-request evidence was accepted during redaction test")?;
    assert_redacted(&format!("{failure:?}"));
    let (_, evidence, _) = failure.into_parts();
    let outcome =
        resolution.apply_resolution_evidence(evidence).map_err(|failure| -> Box<dyn Error> {
            format!("exact evidence failed: {failure:?}").into()
        })?;
    assert_redacted(&format!("{outcome:?}"));
    let LocalLogStorageAppendResolutionOutcome::HeadPresentAtResolution(present) = outcome else {
        return Err("redaction fixture did not produce head-present payload".into());
    };
    assert_redacted(&format!("{:?}", present.acknowledge_head()));

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, true)?;
    let observation = exact_absence(&resolution)?;
    let (retry, _) = completed(resolution, observation)?;
    assert_redacted(&format!("{retry:?}"));

    let ResolutionFixture { resolution, .. } =
        resolution_fixture(SourceCase::UncertainBeforeEgress, true)?;
    let (resolved, _) = completed(
        resolution,
        LocalLogStorageAppendResolutionObservation::current_context_changed(foreign_current(
            LocalLogStorageSelectionKind::Root,
        )?),
    )?;
    assert_redacted(&format!("{resolved:?}"));
    Ok(())
}
