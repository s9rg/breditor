//! Adversarial contracts for terminal head evidence and exact FIFO acknowledgement.

use crate::local_log::{
    LocalLogStorageAppendAttemptId, LocalLogStorageAppendRequestId, LocalLogStorageChunkStart,
};

use super::{
    LocalLogStorageAppendHeadAcknowledgementOutcome, LocalLogStorageAppendQueue,
    LocalLogStorageAppendQueueLimits, LocalLogStorageAppendTerminalAttestation,
    LocalLogStorageAppendTerminalOutcome, LocalLogStorageAppendTransitionError,
    LocalLogStorageAppendTransitionErrorCode, LocalLogStorageSelectionKind,
    LocalLogStorageUncertainAppendAttempt,
    local_log_storage_append_attempt_adversarial_tests::{
        FRAME_SENTINEL, QueueSnapshot, SELECTION_SENTINEL, TestResult, insertion_entry, queue,
    },
};

const TERMINAL_SENTINEL: &str = "APPEND-TERMINAL-PRIVATE-FRAME-SENTINEL";

#[test]
fn terminal_rejection_precedence_preserves_owner_and_cannot_launder_early_evidence() -> TestResult {
    let (_, queue, _) = queue(
        LocalLogStorageSelectionKind::Rotation,
        "replay:append-terminal:correlation",
        TERMINAL_SENTINEL,
        LocalLogStorageAppendQueueLimits::new(2, u64::MAX),
    )?;
    let snapshot = QueueSnapshot::capture(&queue);
    let attempt = queue.begin_head_append_attempt();
    let attempt_id = attempt.attempt_id().clone();

    let foreign_attempt_id = LocalLogStorageAppendAttemptId::new();
    let failure = attempt
        .observe_terminal_attestation(LocalLogStorageAppendTerminalAttestation::not_attempted(
            &foreign_attempt_id,
        ))
        .err()
        .ok_or("foreign not-attempted evidence unexpectedly matched")?;
    assert_eq!(failure.code(), LocalLogStorageAppendTransitionErrorCode::AttemptIdMismatch);
    assert_eq!(failure.error(), &LocalLogStorageAppendTransitionError::AttemptIdMismatch);
    assert_eq!(failure.attestation().attempt_id(), &foreign_attempt_id);
    snapshot.assert_attempt(failure.owner());
    let (attempt, _, _) = failure.into_parts();

    // Tests can mint a same-attempt sibling request identity through the
    // crate-private constructor. Public adapters cannot obtain any request ID
    // before the owner emits its borrowed request.
    let premature_request_id = LocalLogStorageAppendRequestId::new(&attempt_id);
    let failure = attempt
        .observe_terminal_attestation(
            LocalLogStorageAppendTerminalAttestation::transaction_completed(&premature_request_id),
        )
        .err()
        .ok_or("pre-egress transaction completion unexpectedly matched")?;
    assert_eq!(failure.code(), LocalLogStorageAppendTransitionErrorCode::RequestNotIssued);
    snapshot.assert_attempt(failure.owner());
    let failure_debug = format!("{failure:?} {failure}");
    assert!(!failure_debug.contains(TERMINAL_SENTINEL));
    assert!(!failure_debug.contains(SELECTION_SENTINEL));
    let (mut attempt, premature, _) = failure.into_parts();

    let actual_request_id = attempt.adapter_request()?.request_id().clone();
    assert_ne!(actual_request_id, premature_request_id);
    let failure = attempt
        .observe_terminal_attestation(premature)
        .err()
        .ok_or("rejected pre-egress evidence was laundered after request issue")?;
    assert_eq!(failure.code(), LocalLogStorageAppendTransitionErrorCode::RequestIdMismatch);
    assert_eq!(failure.attestation().request_id(), Some(&premature_request_id));
    snapshot.assert_attempt(failure.owner());
    let attempt = failure.into_owner();

    let outcome = attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::transaction_completed(&actual_request_id),
    )?;
    let LocalLogStorageAppendTerminalOutcome::HeadPresent(present) = outcome else {
        return Err("matching completion did not produce head-present state".into());
    };
    assert_eq!(present.attempt_id(), &attempt_id);
    assert_eq!(present.request_id(), &actual_request_id);
    snapshot.assert_queue(present.queue());
    Ok(())
}

#[test]
fn not_attempted_before_and_after_egress_preserves_exact_queue_for_fresh_resubmission() -> TestResult
{
    for issue_request in [false, true] {
        let (_, queue, entry) = queue(
            LocalLogStorageSelectionKind::Root,
            "replay:append-terminal:not-attempted",
            TERMINAL_SENTINEL,
            LocalLogStorageAppendQueueLimits::new(2, u64::MAX),
        )?;
        let queue = queue.try_enqueue(&entry)?.into_queue();
        let snapshot = QueueSnapshot::capture(&queue);
        let mut attempt = queue.begin_head_append_attempt();
        let old_attempt_id = attempt.attempt_id().clone();
        let old_request_id = if issue_request {
            Some(attempt.adapter_request()?.request_id().clone())
        } else {
            None
        };

        let outcome = attempt.observe_terminal_attestation(
            LocalLogStorageAppendTerminalAttestation::not_attempted(&old_attempt_id),
        )?;
        let outcome_debug = format!("{outcome:?}");
        assert!(!outcome_debug.contains(TERMINAL_SENTINEL));
        assert!(!outcome_debug.contains(SELECTION_SENTINEL));
        let LocalLogStorageAppendTerminalOutcome::NotAttempted(not_attempted) = outcome else {
            return Err("matching not-attempted evidence produced the wrong state".into());
        };
        assert_eq!(not_attempted.attempt_id(), &old_attempt_id);
        assert_eq!(not_attempted.request_issued(), issue_request);
        snapshot.assert_queue(not_attempted.queue());
        let not_attempted_debug = format!("{not_attempted:?}");
        assert!(!not_attempted_debug.contains(TERMINAL_SENTINEL));
        assert!(!not_attempted_debug.contains(SELECTION_SENTINEL));

        let retry = not_attempted.begin_exact_resubmission();
        assert_ne!(retry.attempt_id(), &old_attempt_id);
        assert!(!retry.request_issued());
        snapshot.assert_attempt(&retry);

        let mut retry = if let Some(old_request_id) = old_request_id {
            let failure = retry
                .observe_terminal_attestation(
                    LocalLogStorageAppendTerminalAttestation::transaction_completed(
                        &old_request_id,
                    ),
                )
                .err()
                .ok_or("stale completion matched a not-attempted resubmission")?;
            assert_eq!(failure.code(), LocalLogStorageAppendTransitionErrorCode::AttemptIdMismatch);
            snapshot.assert_attempt(failure.owner());
            failure.into_owner()
        } else {
            retry
        };

        let new_request_id = retry.adapter_request()?.request_id().clone();
        assert_ne!(new_request_id.attempt_id(), &old_attempt_id);
        snapshot.assert_attempt(&retry);
    }
    Ok(())
}

#[test]
fn transaction_abort_preserves_exact_queue_and_stale_callback_cannot_match_retry() -> TestResult {
    let (_, queue, entry) = queue(
        LocalLogStorageSelectionKind::Rotation,
        "replay:append-terminal:abort",
        TERMINAL_SENTINEL,
        LocalLogStorageAppendQueueLimits::new(2, u64::MAX),
    )?;
    let queue = queue.try_enqueue(&entry)?.into_queue();
    let snapshot = QueueSnapshot::capture(&queue);
    let mut attempt = queue.begin_head_append_attempt();
    let old_attempt_id = attempt.attempt_id().clone();
    let old_request_id = attempt.adapter_request()?.request_id().clone();

    let outcome = attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::transaction_aborted(&old_request_id),
    )?;
    let outcome_debug = format!("{outcome:?}");
    assert!(!outcome_debug.contains(TERMINAL_SENTINEL));
    assert!(!outcome_debug.contains(SELECTION_SENTINEL));
    let LocalLogStorageAppendTerminalOutcome::AttemptAborted(aborted) = outcome else {
        return Err("matching transaction abort produced the wrong state".into());
    };
    assert_eq!(aborted.attempt_id(), &old_attempt_id);
    assert_eq!(aborted.request_id(), &old_request_id);
    snapshot.assert_queue(aborted.queue());
    let aborted_debug = format!("{aborted:?}");
    assert!(!aborted_debug.contains(TERMINAL_SENTINEL));
    assert!(!aborted_debug.contains(SELECTION_SENTINEL));

    let retry = aborted.begin_exact_resubmission();
    assert_ne!(retry.attempt_id(), &old_attempt_id);
    assert!(!retry.request_issued());
    snapshot.assert_attempt(&retry);
    let failure = retry
        .observe_terminal_attestation(
            LocalLogStorageAppendTerminalAttestation::transaction_completed(&old_request_id),
        )
        .err()
        .ok_or("stale completion matched an aborted resubmission")?;
    assert_eq!(failure.code(), LocalLogStorageAppendTransitionErrorCode::AttemptIdMismatch);
    snapshot.assert_attempt(failure.owner());
    Ok(())
}

#[test]
fn one_completed_head_requires_explicit_acknowledgement_before_draining() -> TestResult {
    let (_, queue, _) = queue(
        LocalLogStorageSelectionKind::Root,
        "replay:append-terminal:drain",
        TERMINAL_SENTINEL,
        LocalLogStorageAppendQueueLimits::new(3, u64::MAX),
    )?;
    let acquisition_request_id = queue.token().request_id().clone();
    let limits = queue.limits();
    let head_start = queue.head_chunk_start();
    let head_end = queue.head_frame_end();
    let head_bytes = queue.head_frame_bytes();
    let head_observation = queue.head_observation_outcome();
    let final_end = queue.speculative_tail_end();
    let snapshot = QueueSnapshot::capture(&queue);
    let mut attempt = queue.begin_head_append_attempt();
    let append_request_id = attempt.adapter_request()?.request_id().clone();

    let outcome = attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::transaction_completed(&append_request_id),
    )?;
    let outcome_debug = format!("{outcome:?}");
    assert!(!outcome_debug.contains(TERMINAL_SENTINEL));
    assert!(!outcome_debug.contains(SELECTION_SENTINEL));
    let LocalLogStorageAppendTerminalOutcome::HeadPresent(present) = outcome else {
        return Err("matching completion did not retain a head-present state".into());
    };
    snapshot.assert_queue(present.queue());
    assert_eq!(present.request_id(), &append_request_id);

    let outcome = present.acknowledge_head();
    let LocalLogStorageAppendHeadAcknowledgementOutcome::Drained(drained) = outcome else {
        return Err("one-item queue did not drain after its explicit acknowledgement".into());
    };
    assert_eq!(drained.acknowledged_request_id(), &append_request_id);
    assert_eq!(drained.acknowledged_head_chunk_start(), head_start);
    assert_eq!(drained.acknowledged_head_frame_end(), head_end);
    assert_eq!(drained.acknowledged_head_frame_bytes(), head_bytes);
    assert_eq!(drained.acknowledged_head_observation_outcome(), head_observation);
    assert_eq!(drained.token().request_id(), &acquisition_request_id);
    assert_eq!(drained.final_cursor().accepted_byte_offset(), final_end);
    assert_eq!(final_end, head_end);
    assert_eq!(drained.limits(), limits);
    let drained_debug = format!("{drained:?}");
    assert!(!drained_debug.contains(TERMINAL_SENTINEL));
    assert!(!drained_debug.contains(SELECTION_SENTINEL));

    let (token, final_cursor, recovered_limits) = drained.into_parts();
    assert_eq!(token.request_id(), &acquisition_request_id);
    assert_eq!(final_cursor.accepted_byte_offset(), final_end);
    assert_eq!(recovered_limits, limits);
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn each_completed_head_advances_exactly_one_fifo_position_before_final_drain() -> TestResult {
    let (_, queue, _) = queue(
        LocalLogStorageSelectionKind::Rotation,
        "replay:append-terminal:fifo:first",
        FRAME_SENTINEL,
        LocalLogStorageAppendQueueLimits::new(4, u64::MAX),
    )?;
    let first_start = queue.head_chunk_start();
    let first_end = queue.head_frame_end();
    let first_bytes = queue.head_frame_bytes();
    let first_observation = queue.head_observation_outcome();
    let first_frame_pointer = queue.head_frame().as_ptr();

    let second = insertion_entry(
        queue.speculative_cursor(),
        "replay:append-terminal:fifo:second",
        "second",
    )?;
    let second_step = queue.try_enqueue(&second)?;
    let second_start = second_step.chunk_start();
    let second_end = second_step.frame_end();
    let second_bytes = second_step.frame_bytes();
    let second_observation = second_step.observation_outcome();
    let queue = second_step.into_queue();

    // Egress happens before the third logical enqueue. The completion still
    // applies to only the original head while the follower remains private.
    let mut first_attempt = queue.begin_head_append_attempt();
    let first_request_id = first_attempt.adapter_request()?.request_id().clone();
    let third = insertion_entry(
        first_attempt.queue().speculative_cursor(),
        "replay:append-terminal:fifo:third",
        "third",
    )?;
    let third_step = first_attempt.try_enqueue(&third)?;
    let third_start = third_step.chunk_start();
    let third_end = third_step.frame_end();
    let third_bytes = third_step.frame_bytes();
    let third_observation = third_step.observation_outcome();
    let first_attempt = third_step.into_owner();
    assert!(first_attempt.request_issued());

    let mut attempt_parts = first_attempt.into_parts();
    let queue_parts = attempt_parts.queue.into_parts();
    let mut followers = queue_parts.followers.iter();
    let second_frame_pointer =
        followers.next().ok_or("three-frame queue lost its second frame")?.frame().as_ptr();
    let third_frame_pointer =
        followers.next().ok_or("three-frame queue lost its third frame")?.frame().as_ptr();
    assert!(followers.next().is_none());
    assert_eq!(queue_parts.head.frame().as_ptr(), first_frame_pointer);
    attempt_parts.queue = LocalLogStorageAppendQueue::from_parts(queue_parts);
    let first_attempt = LocalLogStorageUncertainAppendAttempt::from_parts(attempt_parts);

    let original_pending_frames = first_attempt.queue().pending_frames();
    let original_pending_bytes = first_attempt.queue().pending_bytes();
    let final_end = first_attempt.queue().speculative_tail_end();
    let final_observations = first_attempt.queue().speculative_cursor().owner().observation_count();
    let final_unique_events =
        first_attempt.queue().speculative_cursor().owner().unique_event_count();
    let final_exact_duplicates =
        first_attempt.queue().speculative_cursor().owner().exact_duplicate_count();
    let limits = first_attempt.queue().limits();
    let acquisition_request_id = first_attempt.queue().token().request_id().clone();

    let first_outcome = first_attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::transaction_completed(&first_request_id),
    )?;
    let first_outcome_debug = format!("{first_outcome:?}");
    assert!(!first_outcome_debug.contains(FRAME_SENTINEL));
    assert!(!first_outcome_debug.contains(SELECTION_SENTINEL));
    let LocalLogStorageAppendTerminalOutcome::HeadPresent(first_present) = first_outcome else {
        return Err("first completion did not produce head-present state".into());
    };
    assert_eq!(first_present.queue().pending_frames(), 3);
    let first_ack = first_present.acknowledge_head();
    let first_ack_debug = format!("{first_ack:?}");
    assert!(!first_ack_debug.contains(FRAME_SENTINEL));
    assert!(!first_ack_debug.contains(SELECTION_SENTINEL));
    let LocalLogStorageAppendHeadAcknowledgementOutcome::Pending(first_acknowledged) = first_ack
    else {
        return Err("first of three heads unexpectedly drained the queue".into());
    };
    assert_eq!(first_acknowledged.acknowledged_request_id(), &first_request_id);
    assert_eq!(first_acknowledged.acknowledged_head_chunk_start(), first_start);
    assert_eq!(first_acknowledged.acknowledged_head_frame_end(), first_end);
    assert_eq!(first_acknowledged.acknowledged_head_frame_bytes(), first_bytes);
    assert_eq!(first_acknowledged.acknowledged_head_observation_outcome(), first_observation);
    assert_eq!(first_acknowledged.queue().head_chunk_start(), second_start);
    assert_eq!(first_acknowledged.queue().head_frame().as_ptr(), second_frame_pointer);
    assert_eq!(first_acknowledged.queue().head_frame_end(), second_end);
    assert_eq!(first_acknowledged.queue().head_frame_bytes(), second_bytes);
    assert_eq!(first_acknowledged.queue().head_observation_outcome(), second_observation);
    assert_eq!(first_acknowledged.queue().pending_frames(), original_pending_frames - 1);
    assert_eq!(
        first_acknowledged.queue().pending_bytes(),
        original_pending_bytes - u64::try_from(first_bytes)?
    );
    assert_eq!(first_acknowledged.queue().speculative_tail_end(), final_end);
    assert_eq!(
        first_acknowledged.queue().speculative_cursor().owner().observation_count(),
        final_observations
    );
    assert_eq!(
        first_acknowledged.queue().speculative_cursor().owner().unique_event_count(),
        final_unique_events
    );
    assert_eq!(
        first_acknowledged.queue().speculative_cursor().owner().exact_duplicate_count(),
        final_exact_duplicates
    );
    assert_eq!(first_acknowledged.queue().limits(), limits);
    assert_eq!(first_acknowledged.queue().token().request_id(), &acquisition_request_id);

    let mut second_attempt = first_acknowledged.into_queue().begin_head_append_attempt();
    let second_request_id = second_attempt.adapter_request()?.request_id().clone();
    assert_ne!(second_request_id, first_request_id);
    let failure = second_attempt
        .observe_terminal_attestation(
            LocalLogStorageAppendTerminalAttestation::transaction_completed(&first_request_id),
        )
        .err()
        .ok_or("the prior head's duplicate completion matched the promoted head")?;
    assert_eq!(failure.code(), LocalLogStorageAppendTransitionErrorCode::AttemptIdMismatch);
    assert_eq!(failure.owner().request_id(), Some(&second_request_id));
    assert_eq!(failure.owner().queue().head_chunk_start(), second_start);
    assert_eq!(failure.owner().queue().pending_frames(), 2);
    second_attempt = failure.into_owner();
    let second_outcome = second_attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::transaction_completed(&second_request_id),
    )?;
    let LocalLogStorageAppendTerminalOutcome::HeadPresent(second_present) = second_outcome else {
        return Err("second completion did not produce head-present state".into());
    };
    let second_ack = second_present.acknowledge_head();
    let LocalLogStorageAppendHeadAcknowledgementOutcome::Pending(second_acknowledged) = second_ack
    else {
        return Err("second of three heads unexpectedly drained the queue".into());
    };
    assert_eq!(second_acknowledged.acknowledged_request_id(), &second_request_id);
    assert_eq!(second_acknowledged.acknowledged_head_chunk_start(), second_start);
    assert_eq!(second_acknowledged.acknowledged_head_frame_end(), second_end);
    assert_eq!(second_acknowledged.acknowledged_head_frame_bytes(), second_bytes);
    assert_eq!(second_acknowledged.queue().pending_frames(), 1);
    assert_eq!(second_acknowledged.queue().pending_bytes(), u64::try_from(third_bytes)?);
    assert_eq!(second_acknowledged.queue().head_chunk_start(), third_start);
    assert_eq!(second_acknowledged.queue().head_frame().as_ptr(), third_frame_pointer);
    assert_eq!(second_acknowledged.queue().head_frame_end(), third_end);
    assert_eq!(second_acknowledged.queue().head_frame_bytes(), third_bytes);
    assert_eq!(second_acknowledged.queue().head_observation_outcome(), third_observation);
    assert_eq!(second_acknowledged.queue().speculative_tail_end(), final_end);
    assert_eq!(
        second_acknowledged.queue().speculative_cursor().owner().observation_count(),
        final_observations
    );
    assert_eq!(
        second_acknowledged.queue().speculative_cursor().owner().unique_event_count(),
        final_unique_events
    );
    assert_eq!(
        second_acknowledged.queue().speculative_cursor().owner().exact_duplicate_count(),
        final_exact_duplicates
    );

    let mut third_attempt = second_acknowledged.into_queue().begin_head_append_attempt();
    let third_request_id = third_attempt.adapter_request()?.request_id().clone();
    assert_ne!(third_request_id, first_request_id);
    assert_ne!(third_request_id, second_request_id);
    let third_outcome = third_attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::transaction_completed(&third_request_id),
    )?;
    let LocalLogStorageAppendTerminalOutcome::HeadPresent(third_present) = third_outcome else {
        return Err("third completion did not produce head-present state".into());
    };
    let third_ack = third_present.acknowledge_head();
    let LocalLogStorageAppendHeadAcknowledgementOutcome::Drained(drained) = third_ack else {
        return Err("third and final head did not drain the queue".into());
    };
    assert_eq!(drained.acknowledged_request_id(), &third_request_id);
    assert_eq!(drained.acknowledged_head_chunk_start(), third_start);
    assert_eq!(drained.acknowledged_head_frame_end(), third_end);
    assert_eq!(drained.acknowledged_head_frame_bytes(), third_bytes);
    assert_eq!(drained.acknowledged_head_observation_outcome(), third_observation);
    assert_eq!(drained.final_cursor().accepted_byte_offset(), final_end);
    assert_eq!(drained.final_cursor().owner().observation_count(), final_observations);
    assert_eq!(drained.final_cursor().owner().unique_event_count(), final_unique_events);
    assert_eq!(drained.final_cursor().owner().exact_duplicate_count(), final_exact_duplicates);
    assert_eq!(drained.token().request_id(), &acquisition_request_id);
    assert_eq!(drained.limits(), limits);
    Ok(())
}

#[test]
fn exact_duplicate_ack_metadata_survives_released_capacity_and_a_new_enqueue() -> TestResult {
    let (_, queue, entry) = queue(
        LocalLogStorageSelectionKind::Root,
        "replay:append-terminal:exact-duplicate",
        TERMINAL_SENTINEL,
        LocalLogStorageAppendQueueLimits::new(2, u64::MAX),
    )?;
    let duplicate_step = queue.try_enqueue(&entry)?;
    let duplicate_start = duplicate_step.chunk_start();
    let duplicate_end = duplicate_step.frame_end();
    let duplicate_bytes = duplicate_step.frame_bytes();
    let duplicate_observation = duplicate_step.observation_outcome();
    assert!(matches!(
        duplicate_observation,
        crate::local_log::LocalLogObservationOutcome::ExactDuplicate { .. }
    ));

    let mut first_attempt = duplicate_step.into_queue().begin_head_append_attempt();
    let first_request_id = first_attempt.adapter_request()?.request_id().clone();
    let first_outcome = first_attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::transaction_completed(&first_request_id),
    )?;
    let LocalLogStorageAppendTerminalOutcome::HeadPresent(first_present) = first_outcome else {
        return Err("duplicate-capacity first completion was not head-present".into());
    };
    let LocalLogStorageAppendHeadAcknowledgementOutcome::Pending(first_acknowledged) =
        first_present.acknowledge_head()
    else {
        return Err("duplicate follower disappeared after first acknowledgement".into());
    };
    assert_eq!(first_acknowledged.queue().pending_frames(), 1);
    assert_eq!(first_acknowledged.queue().remaining_frame_capacity(), 1);
    assert_eq!(first_acknowledged.queue().head_chunk_start(), duplicate_start);
    assert_eq!(first_acknowledged.queue().head_observation_outcome(), duplicate_observation);

    let fourth = insertion_entry(
        first_acknowledged.queue().speculative_cursor(),
        "replay:append-terminal:after-capacity-release",
        "after capacity release",
    )?;
    let queue = first_acknowledged.into_queue().try_enqueue(&fourth)?.into_queue();
    let observations_before_duplicate_ack = queue.speculative_cursor().owner().observation_count();
    let unique_events_before_duplicate_ack =
        queue.speculative_cursor().owner().unique_event_count();
    let exact_duplicates_before_duplicate_ack =
        queue.speculative_cursor().owner().exact_duplicate_count();
    assert_eq!(queue.pending_frames(), 2);
    assert_eq!(queue.remaining_frame_capacity(), 0);
    assert_eq!(queue.head_chunk_start(), duplicate_start);

    let mut duplicate_attempt = queue.begin_head_append_attempt();
    let duplicate_request_id = duplicate_attempt.adapter_request()?.request_id().clone();
    let duplicate_outcome = duplicate_attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::transaction_completed(&duplicate_request_id),
    )?;
    let LocalLogStorageAppendTerminalOutcome::HeadPresent(duplicate_present) = duplicate_outcome
    else {
        return Err("exact-duplicate completion was not head-present".into());
    };
    let duplicate_ack = duplicate_present.acknowledge_head();
    let LocalLogStorageAppendHeadAcknowledgementOutcome::Pending(duplicate_acknowledged) =
        duplicate_ack
    else {
        return Err("newly enqueued successor was lost after duplicate acknowledgement".into());
    };
    assert_eq!(duplicate_acknowledged.acknowledged_request_id(), &duplicate_request_id);
    assert_eq!(duplicate_acknowledged.acknowledged_head_chunk_start(), duplicate_start);
    assert_eq!(duplicate_acknowledged.acknowledged_head_frame_end(), duplicate_end);
    assert_eq!(duplicate_acknowledged.acknowledged_head_frame_bytes(), duplicate_bytes);
    assert_eq!(
        duplicate_acknowledged.acknowledged_head_observation_outcome(),
        duplicate_observation
    );
    assert_eq!(duplicate_acknowledged.queue().pending_frames(), 1);
    assert_eq!(
        duplicate_acknowledged.queue().speculative_cursor().owner().observation_count(),
        observations_before_duplicate_ack
    );
    assert_eq!(
        duplicate_acknowledged.queue().speculative_cursor().owner().unique_event_count(),
        unique_events_before_duplicate_ack
    );
    assert_eq!(
        duplicate_acknowledged.queue().speculative_cursor().owner().exact_duplicate_count(),
        exact_duplicates_before_duplicate_ack
    );
    Ok(())
}

#[test]
fn acknowledged_ranges_remain_contiguous_and_nonzero() -> TestResult {
    let (_, queue, _) = queue(
        LocalLogStorageSelectionKind::Root,
        "replay:append-terminal:range",
        "range",
        LocalLogStorageAppendQueueLimits::new(1, u64::MAX),
    )?;
    let mut attempt = queue.begin_head_append_attempt();
    let request_id = attempt.adapter_request()?.request_id().clone();
    let outcome = attempt.observe_terminal_attestation(
        LocalLogStorageAppendTerminalAttestation::transaction_completed(&request_id),
    )?;
    let LocalLogStorageAppendTerminalOutcome::HeadPresent(present) = outcome else {
        return Err("range test did not reach head-present state".into());
    };
    let LocalLogStorageAppendHeadAcknowledgementOutcome::Drained(drained) =
        present.acknowledge_head()
    else {
        return Err("range test did not drain".into());
    };
    let start: LocalLogStorageChunkStart = drained.acknowledged_head_chunk_start();
    let encoded_bytes = u64::try_from(drained.acknowledged_head_frame_bytes())?;
    assert_ne!(encoded_bytes, 0);
    assert_eq!(start.get().checked_add(encoded_bytes), Some(drained.acknowledged_head_frame_end()));
    Ok(())
}
