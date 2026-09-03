//! Adversarial contracts for the one-shot queue-head append attempt.

use std::error::Error;

use crate::{
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        LocalLogCheckpointBinding, LocalLogEntry, LocalLogEvent, LocalLogEventKind,
        LocalLogRecoveryLimits, LocalLogSequence, LocalLogStorageFenceId,
        LocalLogStorageWriterEpoch, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{NodePath, TextOffset},
    session::EditorSession,
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};

use super::{
    LocalLogCheckpointJsonCodec, LocalLogFrameScan, LocalLogStorageAppendQueue,
    LocalLogStorageAppendQueueEnqueueErrorCode, LocalLogStorageAppendQueueLimits,
    LocalLogStorageAppendTransitionError, LocalLogStorageAppendTransitionErrorCode,
    LocalLogStorageMutationFenceBinding, LocalLogStorageMutationToken,
    LocalLogStorageSelectionKind, LocalLogStorageUncertainAppendAttempt,
    LocalLogStorageWriterFenceAcquisitionTerminalAttestation,
    LocalLogStorageWriterFenceAcquisitionTerminalOutcome, LocalLogTailCursor,
    SessionCheckpointJsonCodec,
    local_log_storage_generation_selected_tests::SelectedRotationFixture,
};

pub(super) type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const CURRENT_WRITER_FENCE: &str = "fence:append-attempt-current";
const ACQUIRED_WRITER_FENCE: &str = "fence:append-attempt-acquired";
pub(super) const FRAME_SENTINEL: &str = "APPEND-ATTEMPT-PRIVATE-FRAME-SENTINEL";
pub(super) const SELECTION_SENTINEL: &str = "ROTATIONATTEMPTPAYLOADSENTINEL";

fn acquire_token(fixture: &SelectedRotationFixture) -> TestResult<LocalLogStorageMutationToken> {
    let binding = LocalLogStorageMutationFenceBinding::from_selected(
        &fixture.selected,
        LocalLogStorageWriterEpoch::try_new(117)?,
        LocalLogStorageFenceId::try_new(CURRENT_WRITER_FENCE)?,
    );
    let mut owner = binding
        .try_prepare_writer_fence_acquisition(LocalLogStorageFenceId::try_new(
            ACQUIRED_WRITER_FENCE,
        )?)?
        .begin_acquisition();
    let request_id = owner.adapter_request()?.request_id().clone();
    let completed = LocalLogStorageWriterFenceAcquisitionTerminalAttestation::acquisition_completed(
        &request_id,
    );
    let LocalLogStorageWriterFenceAcquisitionTerminalOutcome::Acquired(token) =
        owner.observe_terminal_attestation(completed)?
    else {
        return Err("matching append-attempt test acquisition did not issue a token".into());
    };
    Ok(token)
}

fn selected_cursor(fixture: &SelectedRotationFixture) -> TestResult<LocalLogTailCursor> {
    let checkpoint_binding = LocalLogCheckpointBinding::try_new(
        fixture.selected.session_id().clone(),
        fixture.selected.checkpoint_log_id().clone(),
        fixture.selected.active_log_id().clone(),
    )?;
    let anchor = LocalLogCheckpointJsonCodec::new(fixture.context.clone(), checkpoint_binding)
        .decode(fixture.selected.checkpoint_json())?;
    Ok(anchor.begin_successor_tail(
        LocalLogRecoveryLimits::default(),
        fixture.selected.active_frame().limits(),
    ))
}

pub(super) fn insertion_entry(
    cursor: &LocalLogTailCursor,
    replay_id: &str,
    text: impl Into<String>,
) -> TestResult<LocalLogEntry> {
    let state = cursor.owner().session().state();
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::ZERO,
    )?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    let transaction = Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    let commit = transaction
        .apply(state.context(), state)?
        .into_commit()
        .ok_or("append-attempt test insertion was unexpectedly unchanged")?;
    let sequence =
        cursor.owner().next_sequence().ok_or("append-attempt test sequence exhausted")?;
    Ok(LocalLogEntry::new(
        cursor.owner().session_id().clone(),
        cursor.owner().active_log_id().clone(),
        sequence,
        ReplayId::try_new(replay_id)?,
        LocalLogEvent::commit(commit),
    ))
}

fn publish_insertion(
    session: &mut EditorSession,
    text: impl Into<String>,
    history: HistoryIntent,
) -> TestResult<Commit> {
    let state = session.state();
    let range = TextRange::try_new(
        NodePath::try_from_indices(vec![0])?,
        TextOffset::ZERO,
        TextOffset::ZERO,
    )?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    let transaction = Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, history));
    session
        .apply_transaction(&transaction)?
        .into_commit()
        .ok_or_else(|| "append-attempt producer insertion was unexpectedly unchanged".into())
}

fn next_entry(
    cursor: &LocalLogTailCursor,
    replay_id: &str,
    event: LocalLogEvent,
) -> TestResult<LocalLogEntry> {
    let sequence =
        cursor.owner().next_sequence().ok_or("append-attempt test sequence exhausted")?;
    Ok(LocalLogEntry::new(
        cursor.owner().session_id().clone(),
        cursor.owner().active_log_id().clone(),
        sequence,
        ReplayId::try_new(replay_id)?,
        event,
    ))
}

fn control_entry(
    cursor: &LocalLogTailCursor,
    replay_id: &str,
    sequence: LocalLogSequence,
    event: LocalLogEvent,
) -> TestResult<LocalLogEntry> {
    Ok(LocalLogEntry::new(
        cursor.owner().session_id().clone(),
        cursor.owner().active_log_id().clone(),
        sequence,
        ReplayId::try_new(replay_id)?,
        event,
    ))
}

pub(super) fn queue(
    kind: LocalLogStorageSelectionKind,
    replay_id: &str,
    text: impl Into<String>,
    limits: LocalLogStorageAppendQueueLimits,
) -> TestResult<(SelectedRotationFixture, LocalLogStorageAppendQueue, LocalLogEntry)> {
    let fixture = SelectedRotationFixture::new(kind)?;
    let token = acquire_token(&fixture)?;
    let cursor = selected_cursor(&fixture)?;
    let entry = insertion_entry(&cursor, replay_id, text)?;
    let plan = token.try_prepare_append(cursor, &entry)?;
    Ok((fixture, plan.try_into_queue(limits)?, entry))
}

#[derive(Clone)]
pub(super) struct QueueSnapshot {
    token_request_id: crate::local_log::LocalLogStorageWriterFenceAcquisitionRequestId,
    current_json: *const u8,
    predecessor_json: Option<*const u8>,
    head_frame: *const u8,
    follower_frames: Vec<*const u8>,
    head_start: crate::local_log::LocalLogStorageChunkStart,
    head_end: u64,
    head_bytes: usize,
    pending_frames: u64,
    pending_bytes: u64,
    speculative_end: u64,
    observations: u64,
    unique_events: u64,
    exact_duplicates: u64,
    limits: LocalLogStorageAppendQueueLimits,
}

impl QueueSnapshot {
    pub(super) fn capture(queue: &LocalLogStorageAppendQueue) -> Self {
        Self {
            token_request_id: queue.token().request_id().clone(),
            current_json: queue.expected_binding().current_selection_json().as_ptr(),
            predecessor_json: queue
                .expected_binding()
                .predecessor_selection_json()
                .map(str::as_ptr),
            head_frame: queue.head_frame().as_ptr(),
            follower_frames: queue.follower_frame_pointers(),
            head_start: queue.head_chunk_start(),
            head_end: queue.head_frame_end(),
            head_bytes: queue.head_frame_bytes(),
            pending_frames: queue.pending_frames(),
            pending_bytes: queue.pending_bytes(),
            speculative_end: queue.speculative_tail_end(),
            observations: queue.speculative_cursor().owner().observation_count(),
            unique_events: queue.speculative_cursor().owner().unique_event_count(),
            exact_duplicates: queue.speculative_cursor().owner().exact_duplicate_count(),
            limits: queue.limits(),
        }
    }

    pub(super) fn assert_queue(&self, queue: &LocalLogStorageAppendQueue) {
        assert_eq!(queue.token().request_id(), &self.token_request_id);
        assert_eq!(queue.expected_binding().current_selection_json().as_ptr(), self.current_json);
        assert_eq!(
            queue.expected_binding().predecessor_selection_json().map(str::as_ptr),
            self.predecessor_json
        );
        assert_eq!(queue.head_frame().as_ptr(), self.head_frame);
        assert_eq!(queue.follower_frame_pointers(), self.follower_frames);
        assert_eq!(queue.head_chunk_start(), self.head_start);
        assert_eq!(queue.head_frame_end(), self.head_end);
        assert_eq!(queue.head_frame_bytes(), self.head_bytes);
        assert_eq!(queue.pending_frames(), self.pending_frames);
        assert_eq!(queue.pending_bytes(), self.pending_bytes);
        assert_eq!(queue.speculative_tail_end(), self.speculative_end);
        assert_eq!(queue.speculative_cursor().owner().observation_count(), self.observations);
        assert_eq!(queue.speculative_cursor().owner().unique_event_count(), self.unique_events);
        assert_eq!(
            queue.speculative_cursor().owner().exact_duplicate_count(),
            self.exact_duplicates
        );
        assert_eq!(queue.limits(), self.limits);
    }

    pub(super) fn assert_attempt(&self, attempt: &LocalLogStorageUncertainAppendAttempt) {
        self.assert_queue(attempt.queue());
    }
}

#[test]
fn request_is_one_shot_exact_head_only_nonzero_and_redacted_for_root_and_rotation() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(kind)?;
        let token = acquire_token(&fixture)?;
        let cursor = selected_cursor(&fixture)?;
        let (owner, _, frame_limits) = cursor.into_parts();
        let trusted_origin = 8_192;
        let cursor = LocalLogTailCursor::from_trusted_parts(owner, trusted_origin, frame_limits);
        let entry = insertion_entry(&cursor, "replay:append-attempt:one-shot", FRAME_SENTINEL)?;
        let plan = token.try_prepare_append(cursor, &entry)?;
        let expected_frame = plan.frame().clone();
        let frame_bytes = u64::try_from(plan.frame_bytes())?;
        let queue = plan.try_into_queue(LocalLogStorageAppendQueueLimits::new(3, u64::MAX))?;
        let snapshot = QueueSnapshot::capture(&queue);
        let mut attempt = queue.begin_head_append_attempt();
        let attempt_id = attempt.attempt_id().clone();
        let expected_binding = attempt.queue().expected_binding().clone();
        let expected_writer_epoch = attempt.queue().token().writer_epoch();
        let expected_writer_fence_id = attempt.queue().token().current_writer_fence_id().clone();

        assert!(!attempt.request_issued());
        snapshot.assert_attempt(&attempt);
        assert_eq!(snapshot.head_start.get(), trusted_origin);
        assert_eq!(snapshot.head_end, trusted_origin + frame_bytes);

        let request_id = {
            let request = attempt.adapter_request()?;
            assert_eq!(request.attempt_id(), &attempt_id);
            assert_eq!(request.request_id().attempt_id(), &attempt_id);
            assert_eq!(request.expected_binding(), &expected_binding);
            assert_eq!(request.selected_binding(), expected_binding.selected_binding());
            assert_eq!(request.expected_writer_epoch(), expected_writer_epoch);
            assert_eq!(request.expected_writer_fence_id(), &expected_writer_fence_id);
            assert_eq!(request.head_chunk_start().get(), trusted_origin);
            assert_eq!(request.head_frame_end(), trusted_origin + frame_bytes);
            assert_eq!(request.head_frame_bytes(), expected_frame.len());
            assert_eq!(request.head_frame().as_ptr(), expected_frame.as_ptr());
            assert_eq!(request.head_frame(), expected_frame.as_ref());
            assert!(String::from_utf8_lossy(request.head_frame()).contains(FRAME_SENTINEL));
            assert_eq!(request.current_selection_json().as_ptr(), snapshot.current_json);
            assert_eq!(
                request.predecessor_selection_json().map(str::as_ptr),
                snapshot.predecessor_json
            );
            assert_eq!(
                request.predecessor_selection_json().is_some(),
                kind == LocalLogStorageSelectionKind::Rotation
            );
            assert_eq!(
                request.current_selection_json_bytes(),
                request.current_selection_json().len()
            );
            assert_eq!(
                request.predecessor_selection_json_bytes(),
                request.predecessor_selection_json().map(str::len)
            );

            let request_debug = format!("{request:?}");
            assert!(request_debug.contains("LocalLogStorageAppendRequest"));
            assert!(request_debug.contains("head_frame_bytes"));
            assert!(!request_debug.contains(FRAME_SENTINEL));
            assert!(!request_debug.contains(SELECTION_SENTINEL));
            assert!(!request_debug.contains(request.current_selection_json()));
            request.request_id().clone()
        };

        assert!(attempt.request_issued());
        assert_eq!(request_id.attempt_id(), &attempt_id);
        snapshot.assert_attempt(&attempt);
        let error = attempt
            .adapter_request()
            .err()
            .ok_or("one append attempt yielded a second adapter request")?;
        assert_eq!(error, LocalLogStorageAppendTransitionError::RequestAlreadyIssued);
        assert_eq!(error.code(), LocalLogStorageAppendTransitionErrorCode::RequestAlreadyIssued);
        assert!(attempt.request_issued());
        snapshot.assert_attempt(&attempt);
    }
    Ok(())
}

#[test]
fn enqueue_before_and_after_egress_keeps_head_and_correlation_stable() -> TestResult {
    let (_, queue, first) = queue(
        LocalLogStorageSelectionKind::Root,
        "replay:append-attempt:fifo:first",
        "first",
        LocalLogStorageAppendQueueLimits::new(4, u64::MAX),
    )?;
    let head = QueueSnapshot::capture(&queue);
    let mut attempt = queue.begin_head_append_attempt();
    let attempt_id = attempt.attempt_id().clone();

    let second = insertion_entry(
        attempt.queue().speculative_cursor(),
        "replay:append-attempt:fifo:second",
        "second",
    )?;
    let second_start = attempt.queue().speculative_tail_end();
    let step = attempt.try_enqueue(&second)?;
    assert_eq!(step.owner().attempt_id(), &attempt_id);
    assert!(!step.owner().request_issued());
    assert_eq!(step.chunk_start().get(), second_start);
    assert_eq!(step.frame_end(), second_start + u64::try_from(step.frame_bytes())?);
    assert!(step.observation_outcome().was_applied());
    assert!(!format!("{step:?}").contains(FRAME_SENTINEL));
    attempt = step.into_owner();
    assert_eq!(attempt.queue().pending_frames(), 2);
    assert_eq!(attempt.queue().head_frame().as_ptr(), head.head_frame);

    let request_id = {
        let request = attempt.adapter_request()?;
        assert_eq!(request.head_frame().as_ptr(), head.head_frame);
        assert_eq!(request.head_chunk_start(), head.head_start);
        assert_eq!(request.head_frame_end(), head.head_end);
        assert_eq!(request.head_frame_bytes(), head.head_bytes);
        request.request_id().clone()
    };

    let third = insertion_entry(
        attempt.queue().speculative_cursor(),
        "replay:append-attempt:fifo:third",
        "third",
    )?;
    let third_start = attempt.queue().speculative_tail_end();
    let step = attempt.try_enqueue(&third)?;
    assert_eq!(step.owner().attempt_id(), &attempt_id);
    assert!(step.owner().request_issued());
    assert_eq!(step.owner().request_id(), Some(&request_id));
    assert_eq!(step.chunk_start().get(), third_start);
    assert_eq!(step.frame_end(), third_start + u64::try_from(step.frame_bytes())?);
    attempt = step.into_owner();

    assert_eq!(attempt.queue().pending_frames(), 3);
    assert_eq!(attempt.queue().head_frame().as_ptr(), head.head_frame);
    assert_eq!(attempt.queue().head_chunk_start(), head.head_start);
    assert_eq!(attempt.queue().head_frame_end(), head.head_end);
    assert_eq!(attempt.attempt_id(), &attempt_id);
    assert_eq!(attempt.request_id(), Some(&request_id));
    assert_eq!(first.replay_id().as_str(), "replay:append-attempt:fifo:first");
    assert_eq!(second.replay_id().as_str(), "replay:append-attempt:fifo:second");
    assert_eq!(third.replay_id().as_str(), "replay:append-attempt:fifo:third");
    let error = attempt
        .adapter_request()
        .err()
        .ok_or("post-egress append attempt unexpectedly yielded a second request")?;
    assert_eq!(error, LocalLogStorageAppendTransitionError::RequestAlreadyIssued);
    Ok(())
}

#[test]
fn exact_resubmission_preserves_queue_but_refreshes_pre_and_post_egress_ids() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        for issue_request in [false, true] {
            let (_, queue, entry) = queue(
                kind,
                "replay:append-attempt:resubmit",
                FRAME_SENTINEL,
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
            assert_eq!(attempt.request_issued(), issue_request);
            snapshot.assert_attempt(&attempt);

            let mut retry = attempt.begin_exact_resubmission();
            assert_ne!(retry.attempt_id(), &old_attempt_id);
            assert!(!retry.request_issued());
            snapshot.assert_attempt(&retry);
            assert!(!format!("{retry:?}").contains(FRAME_SENTINEL));
            assert!(!format!("{retry:?}").contains(SELECTION_SENTINEL));

            let new_attempt_id = retry.attempt_id().clone();
            let new_request_id = retry.adapter_request()?.request_id().clone();
            assert_eq!(new_request_id.attempt_id(), &new_attempt_id);
            assert_ne!(new_request_id.attempt_id(), &old_attempt_id);
            if let Some(old_request_id) = old_request_id {
                assert_ne!(new_request_id, old_request_id);
            }
            assert!(retry.request_issued());
            snapshot.assert_attempt(&retry);
        }
    }
    Ok(())
}

#[test]
fn enqueue_failures_before_and_after_egress_recover_the_exact_uncertain_owner() -> TestResult {
    let (_, limited_queue, _) = queue(
        LocalLogStorageSelectionKind::Rotation,
        "replay:append-attempt:failure-head",
        FRAME_SENTINEL,
        LocalLogStorageAppendQueueLimits::new(1, u64::MAX),
    )?;
    let snapshot = QueueSnapshot::capture(&limited_queue);
    let mut attempt = limited_queue.begin_head_append_attempt();
    let attempt_id = attempt.attempt_id().clone();
    let candidate = insertion_entry(
        attempt.queue().speculative_cursor(),
        "replay:append-attempt:failure-candidate",
        FRAME_SENTINEL,
    )?;

    let failure = attempt
        .try_enqueue(&candidate)
        .err()
        .ok_or("count-full pre-egress attempt unexpectedly admitted a follower")?;
    assert_eq!(failure.code(), LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameLimit);
    assert_eq!(failure.owner().attempt_id(), &attempt_id);
    assert!(!failure.owner().request_issued());
    snapshot.assert_attempt(failure.owner());
    assert!(!format!("{failure:?} {failure}").contains(FRAME_SENTINEL));
    assert!(!format!("{failure:?} {failure}").contains(SELECTION_SENTINEL));
    attempt = failure.into_owner();

    let request_id = attempt.adapter_request()?.request_id().clone();
    let failure = attempt
        .try_enqueue(&candidate)
        .err()
        .ok_or("count-full post-egress attempt unexpectedly admitted a follower")?;
    assert_eq!(failure.code(), LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameLimit);
    assert_eq!(failure.owner().attempt_id(), &attempt_id);
    assert!(failure.owner().request_issued());
    assert_eq!(failure.owner().request_id(), Some(&request_id));
    snapshot.assert_attempt(failure.owner());
    attempt = failure.into_owner();
    assert_eq!(attempt.request_id(), Some(&request_id));
    assert_eq!(candidate.replay_id().as_str(), "replay:append-attempt:failure-candidate");
    let error = attempt
        .adapter_request()
        .err()
        .ok_or("recovered post-egress append attempt yielded a second request")?;
    assert_eq!(error, LocalLogStorageAppendTransitionError::RequestAlreadyIssued);

    // Semantic rejection through the uncertain wrapper is just as atomic and
    // must not reset post-egress correlation.
    let (_, queue, _) = queue(
        LocalLogStorageSelectionKind::Root,
        "replay:append-attempt:semantic-head",
        "semantic head",
        LocalLogStorageAppendQueueLimits::new(2, u64::MAX),
    )?;
    let snapshot = QueueSnapshot::capture(&queue);
    let mut attempt = queue.begin_head_append_attempt();
    let attempt_id = attempt.attempt_id().clone();
    let request_id = attempt.adapter_request()?.request_id().clone();
    let wrong_sequence = control_entry(
        attempt.queue().speculative_cursor(),
        "replay:append-attempt:semantic-gap",
        LocalLogSequence::try_new(3)?,
        LocalLogEvent::close_history_group(),
    )?;
    let failure = attempt
        .try_enqueue(&wrong_sequence)
        .err()
        .ok_or("a nonadjacent sequence unexpectedly entered the uncertain queue")?;
    assert_eq!(failure.code(), LocalLogStorageAppendQueueEnqueueErrorCode::TailTransition);
    assert_eq!(failure.owner().attempt_id(), &attempt_id);
    assert_eq!(failure.owner().request_id(), Some(&request_id));
    snapshot.assert_attempt(failure.owner());
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn every_event_kind_can_enqueue_while_the_same_head_remains_the_only_request() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let token = acquire_token(&fixture)?;
    let cursor = selected_cursor(&fixture)?;
    let mut producer = EditorSession::new(cursor.owner().session().state().clone());

    let commit = publish_insertion(&mut producer, "first", HistoryIntent::Record)?;
    let first = next_entry(
        &cursor,
        "replay:append-attempt:all-kinds:commit",
        LocalLogEvent::commit(commit),
    )?;
    let plan = token.try_prepare_append(cursor, &first)?;
    let expected_head_pointer = plan.frame().as_ptr();
    let queue = plan.try_into_queue(LocalLogStorageAppendQueueLimits::new(6, u64::MAX))?;
    let mut attempt = queue.begin_head_append_attempt();

    let undo = producer.undo()?.ok_or("append-attempt undo was unexpectedly unavailable")?;
    let undo = next_entry(
        attempt.queue().speculative_cursor(),
        "replay:append-attempt:all-kinds:undo",
        LocalLogEvent::try_undo(undo)?,
    )?;
    attempt = attempt.try_enqueue(&undo)?.into_owner();

    let redo = producer.redo()?.ok_or("append-attempt redo was unexpectedly unavailable")?;
    let redo = next_entry(
        attempt.queue().speculative_cursor(),
        "replay:append-attempt:all-kinds:redo",
        LocalLogEvent::try_redo(redo)?,
    )?;
    attempt = attempt.try_enqueue(&redo)?.into_owner();

    let group = QualifiedName::try_new("breditor/append-attempt-all-kinds")?;
    let merge = publish_insertion(&mut producer, "merge", HistoryIntent::Merge { group })?;
    let merge = next_entry(
        attempt.queue().speculative_cursor(),
        "replay:append-attempt:all-kinds:merge",
        LocalLogEvent::commit(merge),
    )?;
    attempt = attempt.try_enqueue(&merge)?.into_owner();

    producer.close_history_group();
    let close = next_entry(
        attempt.queue().speculative_cursor(),
        "replay:append-attempt:all-kinds:close",
        LocalLogEvent::close_history_group(),
    )?;
    attempt = attempt.try_enqueue(&close)?.into_owner();

    producer.clear_history();
    let clear = next_entry(
        attempt.queue().speculative_cursor(),
        "replay:append-attempt:all-kinds:clear",
        LocalLogEvent::clear_history(),
    )?;
    attempt = attempt.try_enqueue(&clear)?.into_owner();

    assert_eq!(attempt.queue().pending_frames(), 6);
    assert_eq!(attempt.queue().head_frame().as_ptr(), expected_head_pointer);
    assert_eq!(attempt.queue().speculative_cursor().owner().observation_count(), 6);
    assert_eq!(attempt.queue().speculative_cursor().owner().unique_event_count(), 6);
    assert_eq!(
        SessionCheckpointJsonCodec::new(fixture.context.clone())
            .encode(attempt.queue().speculative_cursor().owner().session())?,
        SessionCheckpointJsonCodec::new(fixture.context).encode(&producer)?
    );

    let codec = attempt.queue().speculative_cursor().frame_codec.clone();
    let request = attempt.adapter_request()?;
    assert_eq!(request.head_frame().as_ptr(), expected_head_pointer);
    let LocalLogFrameScan::Complete(frame) = codec.scan(request.head_frame())? else {
        return Err("append request did not contain one complete frame".into());
    };
    assert!(frame.remaining_bytes().is_empty());
    assert_eq!(codec.decode_frame(frame)?.event_kind(), LocalLogEventKind::Commit);
    drop(request);
    assert!(attempt.request_issued());
    assert_eq!(attempt.queue().pending_frames(), 6);
    assert_eq!(attempt.queue().head_frame().as_ptr(), expected_head_pointer);
    Ok(())
}

#[test]
fn exact_duplicate_follower_is_charged_but_never_replaces_the_request_head() -> TestResult {
    let (_, queue, entry) = queue(
        LocalLogStorageSelectionKind::Root,
        "replay:append-attempt:duplicate",
        "duplicate",
        LocalLogStorageAppendQueueLimits::new(2, u64::MAX),
    )?;
    let head = QueueSnapshot::capture(&queue);
    let mut attempt = queue.begin_head_append_attempt();
    let attempt_id = attempt.attempt_id().clone();
    let step = attempt.try_enqueue(&entry)?;
    assert!(matches!(
        step.observation_outcome(),
        crate::local_log::LocalLogObservationOutcome::ExactDuplicate {
            delivery_index: 1,
            first_delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        }
    ));
    assert_eq!(step.owner().attempt_id(), &attempt_id);
    assert_eq!(step.owner().queue().pending_frames(), 2);
    assert_eq!(step.owner().queue().pending_bytes(), head.pending_bytes * 2);
    attempt = step.into_owner();

    let request = attempt.adapter_request()?;
    assert_eq!(request.head_frame().as_ptr(), head.head_frame);
    assert_eq!(request.head_chunk_start(), head.head_start);
    assert_eq!(request.head_frame_end(), head.head_end);
    assert_eq!(request.head_frame_bytes(), head.head_bytes);
    Ok(())
}

#[test]
fn append_transition_code_is_stable() {
    assert_eq!(
        LocalLogStorageAppendTransitionErrorCode::RequestAlreadyIssued.as_str(),
        "local_log_storage_append_transition.request_already_issued"
    );
    assert_eq!(
        LocalLogStorageAppendTransitionError::RequestAlreadyIssued.code(),
        LocalLogStorageAppendTransitionErrorCode::RequestAlreadyIssued
    );
}
