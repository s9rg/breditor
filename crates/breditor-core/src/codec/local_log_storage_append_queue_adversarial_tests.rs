//! Adversarial contracts for the bounded speculative append FIFO.

use std::error::Error;

use super::local_log_storage_append_queue::LocalLogStorageAppendQueueParts;

use crate::{
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        LocalLogCheckpointBinding, LocalLogEntry, LocalLogEvent, LocalLogEventKind,
        LocalLogObservationOutcome, LocalLogRecoveryLimits, LocalLogSequence,
        LocalLogStorageFenceId, LocalLogStorageWriterEpoch, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{NodePath, TextOffset},
    session::EditorSession,
    state::EditorState,
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};

use super::{
    LocalLogCheckpointJsonCodec, LocalLogFrameErrorCode, LocalLogFrameScan,
    LocalLogStorageAppendPlan, LocalLogStorageAppendQueue, LocalLogStorageAppendQueueEnqueueError,
    LocalLogStorageAppendQueueEnqueueErrorCode, LocalLogStorageAppendQueueLimits,
    LocalLogStorageAppendQueueStartError, LocalLogStorageAppendQueueStartErrorCode,
    LocalLogStorageMutationFenceBinding, LocalLogStorageMutationToken,
    LocalLogStorageSelectionKind, LocalLogStorageWriterFenceAcquisitionTerminalAttestation,
    LocalLogStorageWriterFenceAcquisitionTerminalOutcome, LocalLogTailCursor,
    LocalLogTailErrorCode, SessionCheckpointJsonCodec,
    local_log_storage_generation_selected_tests::SelectedRotationFixture,
};

type TestResult<T = ()> = Result<T, Box<dyn Error>>;

const CURRENT_WRITER_FENCE: &str = "fence:queue-current";
const ACQUIRED_WRITER_FENCE: &str = "fence:queue-acquired";
const PRIVATE_FRAME_PAYLOAD: &str = "QUEUE-PRIVATE-FRAME-PAYLOAD-SENTINEL";
const PRIVATE_SELECTION_PAYLOAD: &str = "ROTATIONATTEMPTPAYLOADSENTINEL";

fn acquire_token(fixture: &SelectedRotationFixture) -> TestResult<LocalLogStorageMutationToken> {
    let binding = LocalLogStorageMutationFenceBinding::from_selected(
        &fixture.selected,
        LocalLogStorageWriterEpoch::try_new(91)?,
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
        return Err("matching queue-test acquisition did not issue a token".into());
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

fn insertion_entry(
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
        .ok_or("queue-test insertion was unexpectedly unchanged")?;
    let sequence = cursor.owner().next_sequence().ok_or("queue-test sequence exhausted")?;
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
        .ok_or_else(|| "queue-test producer insertion was unexpectedly unchanged".into())
}

fn next_entry(
    cursor: &LocalLogTailCursor,
    replay_id: &str,
    event: LocalLogEvent,
) -> TestResult<LocalLogEntry> {
    let sequence = cursor.owner().next_sequence().ok_or("queue-test sequence exhausted")?;
    control_entry(cursor, replay_id, sequence, event)
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

fn prepare_plan(
    fixture: &SelectedRotationFixture,
    replay_id: &str,
    text: impl Into<String>,
) -> TestResult<(LocalLogStorageAppendPlan, LocalLogEntry)> {
    let token = acquire_token(fixture)?;
    let cursor = selected_cursor(fixture)?;
    let entry = insertion_entry(&cursor, replay_id, text)?;
    let plan = token.try_prepare_append(cursor, &entry)?;
    Ok((plan, entry))
}

struct PlanSnapshot {
    request_id: crate::local_log::LocalLogStorageWriterFenceAcquisitionRequestId,
    current_json: *const u8,
    predecessor_json: Option<*const u8>,
    frame: *const u8,
    chunk_start: crate::local_log::LocalLogStorageChunkStart,
    frame_end: u64,
    frame_bytes: usize,
    observation: LocalLogObservationOutcome,
    state: EditorState,
}

impl PlanSnapshot {
    fn capture(plan: &LocalLogStorageAppendPlan) -> Self {
        Self {
            request_id: plan.token().request_id().clone(),
            current_json: plan.expected_binding().current_selection_json().as_ptr(),
            predecessor_json: plan.expected_binding().predecessor_selection_json().map(str::as_ptr),
            frame: plan.frame().as_ptr(),
            chunk_start: plan.chunk_start(),
            frame_end: plan.frame_end(),
            frame_bytes: plan.frame_bytes(),
            observation: plan.observation_outcome(),
            state: plan.speculative_cursor().owner().session().state().clone(),
        }
    }

    fn assert_plan(&self, plan: &LocalLogStorageAppendPlan) {
        assert_eq!(plan.token().request_id(), &self.request_id);
        assert_eq!(plan.expected_binding().current_selection_json().as_ptr(), self.current_json);
        assert_eq!(
            plan.expected_binding().predecessor_selection_json().map(str::as_ptr),
            self.predecessor_json
        );
        assert_eq!(plan.frame().as_ptr(), self.frame);
        assert_eq!(plan.chunk_start(), self.chunk_start);
        assert_eq!(plan.frame_end(), self.frame_end);
        assert_eq!(plan.frame_bytes(), self.frame_bytes);
        assert_eq!(plan.observation_outcome(), self.observation);
        assert_eq!(plan.speculative_cursor().owner().session().state(), &self.state);
    }

    fn assert_queue(&self, queue: &LocalLogStorageAppendQueue) {
        assert_eq!(queue.token().request_id(), &self.request_id);
        assert_eq!(queue.expected_binding().current_selection_json().as_ptr(), self.current_json);
        assert_eq!(
            queue.expected_binding().predecessor_selection_json().map(str::as_ptr),
            self.predecessor_json
        );
        assert_eq!(queue.head_frame().as_ptr(), self.frame);
        assert_eq!(queue.head_chunk_start(), self.chunk_start);
        assert_eq!(queue.head_frame_end(), self.frame_end);
        assert_eq!(queue.head_frame_bytes(), self.frame_bytes);
        assert_eq!(queue.head_observation_outcome(), self.observation);
        assert_eq!(queue.speculative_cursor().owner().session().state(), &self.state);
    }
}

struct QueueSnapshot {
    request_id: crate::local_log::LocalLogStorageWriterFenceAcquisitionRequestId,
    current_json: *const u8,
    predecessor_json: Option<*const u8>,
    head_frame: *const u8,
    head_start: crate::local_log::LocalLogStorageChunkStart,
    head_end: u64,
    head_bytes: usize,
    head_observation: LocalLogObservationOutcome,
    pending_frames: u64,
    pending_bytes: u64,
    speculative_end: u64,
    observations: u64,
    unique_events: u64,
    exact_duplicates: u64,
    state: EditorState,
    limits: LocalLogStorageAppendQueueLimits,
}

impl QueueSnapshot {
    fn capture(queue: &LocalLogStorageAppendQueue) -> Self {
        Self {
            request_id: queue.token().request_id().clone(),
            current_json: queue.expected_binding().current_selection_json().as_ptr(),
            predecessor_json: queue
                .expected_binding()
                .predecessor_selection_json()
                .map(str::as_ptr),
            head_frame: queue.head_frame().as_ptr(),
            head_start: queue.head_chunk_start(),
            head_end: queue.head_frame_end(),
            head_bytes: queue.head_frame_bytes(),
            head_observation: queue.head_observation_outcome(),
            pending_frames: queue.pending_frames(),
            pending_bytes: queue.pending_bytes(),
            speculative_end: queue.speculative_tail_end(),
            observations: queue.speculative_cursor().owner().observation_count(),
            unique_events: queue.speculative_cursor().owner().unique_event_count(),
            exact_duplicates: queue.speculative_cursor().owner().exact_duplicate_count(),
            state: queue.speculative_cursor().owner().session().state().clone(),
            limits: queue.limits(),
        }
    }

    fn assert_retained_by(&self, queue: &LocalLogStorageAppendQueue) {
        assert_eq!(queue.token().request_id(), &self.request_id);
        assert_eq!(queue.expected_binding().current_selection_json().as_ptr(), self.current_json);
        assert_eq!(
            queue.expected_binding().predecessor_selection_json().map(str::as_ptr),
            self.predecessor_json
        );
        assert_eq!(queue.head_frame().as_ptr(), self.head_frame);
        assert_eq!(queue.head_chunk_start(), self.head_start);
        assert_eq!(queue.head_frame_end(), self.head_end);
        assert_eq!(queue.head_frame_bytes(), self.head_bytes);
        assert_eq!(queue.head_observation_outcome(), self.head_observation);
        assert_eq!(queue.pending_frames(), self.pending_frames);
        assert_eq!(queue.pending_bytes(), self.pending_bytes);
        assert_eq!(queue.speculative_tail_end(), self.speculative_end);
        assert_eq!(queue.speculative_cursor().owner().observation_count(), self.observations);
        assert_eq!(queue.speculative_cursor().owner().unique_event_count(), self.unique_events);
        assert_eq!(
            queue.speculative_cursor().owner().exact_duplicate_count(),
            self.exact_duplicates
        );
        assert_eq!(queue.speculative_cursor().owner().session().state(), &self.state);
        assert_eq!(queue.limits(), self.limits);
    }
}

#[test]
fn queue_start_is_nonempty_exact_and_both_limit_failures_recover_the_plan() -> TestResult {
    for kind in [LocalLogStorageSelectionKind::Root, LocalLogStorageSelectionKind::Rotation] {
        let fixture = SelectedRotationFixture::new(kind)?;
        let (plan, entry) = prepare_plan(&fixture, "replay:queue:start", PRIVATE_FRAME_PAYLOAD)?;
        let snapshot = PlanSnapshot::capture(&plan);
        let frame_bytes = u64::try_from(plan.frame_bytes())?;

        let failure = plan
            .try_into_queue(LocalLogStorageAppendQueueLimits::new(0, 0))
            .err()
            .ok_or("zero-frame queue policy unexpectedly accepted its first plan")?;
        assert_eq!(failure.code(), LocalLogStorageAppendQueueStartErrorCode::PendingFrameLimit);
        assert_eq!(
            failure.error(),
            LocalLogStorageAppendQueueStartError::PendingFrameLimit { maximum: 0 }
        );
        snapshot.assert_plan(failure.plan());
        assert!(!format!("{failure:?} {failure}").contains(PRIVATE_FRAME_PAYLOAD));
        let plan = failure.into_plan();

        let failure = plan
            .try_into_queue(LocalLogStorageAppendQueueLimits::new(1, frame_bytes - 1))
            .err()
            .ok_or("undersized queue byte policy unexpectedly accepted its first plan")?;
        assert_eq!(failure.code(), LocalLogStorageAppendQueueStartErrorCode::PendingByteLimit);
        assert_eq!(
            failure.error(),
            LocalLogStorageAppendQueueStartError::PendingByteLimit {
                actual: frame_bytes,
                maximum: frame_bytes - 1,
            }
        );
        snapshot.assert_plan(failure.plan());
        let plan = failure.into_plan();

        let limits = LocalLogStorageAppendQueueLimits::new(1, frame_bytes);
        let queue = plan.try_into_queue(limits)?;
        snapshot.assert_queue(&queue);
        assert_eq!(queue.pending_frames(), 1);
        assert_eq!(queue.pending_bytes(), frame_bytes);
        assert_eq!(queue.remaining_frame_capacity(), 0);
        assert_eq!(queue.remaining_byte_capacity(), 0);
        assert_eq!(queue.speculative_tail_end(), snapshot.frame_end);
        assert_eq!(entry.replay_id().as_str(), "replay:queue:start");

        let debug = format!("{queue:?}");
        assert!(debug.contains("LocalLogStorageAppendQueue"));
        assert!(debug.contains("pending_frames"));
        assert!(!debug.contains(PRIVATE_FRAME_PAYLOAD));
        assert!(!debug.contains(PRIVATE_SELECTION_PAYLOAD));
        assert!(!debug.contains(fixture.selected.checkpoint_json()));
    }
    Ok(())
}

#[test]
fn queue_seed_at_a_nonzero_origin_charges_only_its_exact_frame() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let token = acquire_token(&fixture)?;
    let cursor = selected_cursor(&fixture)?;
    let (owner, _, frame_limits) = cursor.into_parts();
    let trusted_origin = 8_192;
    let cursor = LocalLogTailCursor::from_trusted_parts(owner, trusted_origin, frame_limits);
    let entry = insertion_entry(&cursor, "replay:queue:nonzero-origin", "nonzero")?;
    let plan = token.try_prepare_append(cursor, &entry)?;
    let frame_bytes = u64::try_from(plan.frame_bytes())?;

    assert_eq!(plan.chunk_start().get(), trusted_origin);
    assert_eq!(plan.frame_end(), trusted_origin + frame_bytes);
    let queue = plan.try_into_queue(LocalLogStorageAppendQueueLimits::new(1, frame_bytes))?;
    assert_eq!(queue.pending_bytes(), frame_bytes);
    assert_eq!(queue.remaining_byte_capacity(), 0);
    assert_eq!(queue.speculative_tail_end(), trusted_origin + frame_bytes);
    Ok(())
}

#[test]
fn enqueue_is_fifo_adjacent_and_keeps_the_original_head_stable() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let (plan, first_entry) = prepare_plan(&fixture, "replay:queue:fifo:a", "A")?;
    let first_start = plan.chunk_start().get();
    let first_bytes = u64::try_from(plan.frame_bytes())?;
    let first_end = plan.frame_end();
    let first_frame_pointer = plan.frame().as_ptr();
    let limits = LocalLogStorageAppendQueueLimits::new(3, u64::MAX);
    let mut queue = plan.try_into_queue(limits)?;

    let second_entry =
        insertion_entry(queue.speculative_cursor(), "replay:queue:fifo:b", "second payload")?;
    let second_bytes =
        u64::try_from(queue.speculative_cursor().frame_codec.encode(&second_entry)?.len())?;
    let second_step = queue.try_enqueue(&second_entry)?;
    assert_eq!(second_step.chunk_start().get(), first_end);
    assert_eq!(second_step.frame_end(), first_end + second_bytes);
    assert_eq!(u64::try_from(second_step.frame_bytes())?, second_bytes);
    assert!(second_step.observation_outcome().was_applied());
    queue = second_step.into_queue();
    assert_eq!(queue.head_frame().as_ptr(), first_frame_pointer);
    assert_eq!(queue.head_chunk_start().get(), first_start);
    assert_eq!(queue.head_frame_end(), first_end);
    assert_eq!(queue.pending_frames(), 2);
    assert_eq!(queue.pending_bytes(), first_bytes + second_bytes);
    assert_eq!(queue.speculative_tail_end(), first_end + second_bytes);

    let third_entry = insertion_entry(
        queue.speculative_cursor(),
        "replay:queue:fifo:c",
        "third payload is deliberately longer",
    )?;
    let third_bytes =
        u64::try_from(queue.speculative_cursor().frame_codec.encode(&third_entry)?.len())?;
    queue = queue.try_enqueue(&third_entry)?.into_queue();

    assert_eq!(queue.head_frame().as_ptr(), first_frame_pointer);
    assert_eq!(queue.head_chunk_start().get(), first_start);
    assert_eq!(queue.head_frame_end(), first_end);
    assert_eq!(queue.pending_frames(), 3);
    assert_eq!(queue.pending_bytes(), first_bytes + second_bytes + third_bytes);
    assert_eq!(queue.speculative_tail_end(), first_end + second_bytes + third_bytes);
    assert_eq!(queue.remaining_frame_capacity(), 0);
    assert_eq!(queue.speculative_cursor().owner().observation_count(), 3);
    assert_eq!(queue.speculative_cursor().owner().unique_event_count(), 3);

    let codec = queue.speculative_cursor().frame_codec.clone();
    let LocalLogStorageAppendQueueParts {
        speculative_cursor: cursor,
        head,
        followers,
        pending_frames,
        pending_bytes,
        limits: retained_limits,
        ..
    } = queue.into_parts();
    assert_eq!(followers.len(), 2);
    assert_eq!(pending_frames, 3);
    assert_eq!(pending_bytes, first_bytes + second_bytes + third_bytes);
    assert_eq!(retained_limits, limits);
    assert_eq!(cursor.accepted_byte_offset(), first_end + second_bytes + third_bytes);

    let expected = [
        ("replay:queue:fifo:a", first_start, first_bytes),
        ("replay:queue:fifo:b", first_end, second_bytes),
        ("replay:queue:fifo:c", first_end + second_bytes, third_bytes),
    ];
    for (item, (replay_id, expected_start, expected_bytes)) in
        std::iter::once(&head).chain(followers.iter()).zip(expected)
    {
        assert_eq!(item.chunk_start().get(), expected_start);
        assert_eq!(item.frame_end(), expected_start + expected_bytes);
        assert_eq!(u64::try_from(item.frame().len())?, expected_bytes);
        let LocalLogFrameScan::Complete(frame) = codec.scan(item.frame().as_ref())? else {
            return Err("queued exact frame did not scan as complete".into());
        };
        assert!(frame.remaining_bytes().is_empty());
        let decoded = codec.decode_frame(frame)?;
        assert_eq!(decoded.replay_id().as_str(), replay_id);
    }
    assert_eq!(first_entry.sequence(), LocalLogSequence::FIRST);
    Ok(())
}

#[test]
fn exact_duplicate_is_retained_and_charged_as_a_second_physical_frame() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let (plan, entry) = prepare_plan(&fixture, "replay:queue:duplicate", "duplicate")?;
    let frame_bytes = u64::try_from(plan.frame_bytes())?;
    let first_end = plan.frame_end();
    let step = plan
        .try_into_queue(LocalLogStorageAppendQueueLimits::new(2, frame_bytes * 2))?
        .try_enqueue(&entry)?;
    assert_eq!(step.chunk_start().get(), first_end);
    assert_eq!(step.frame_end(), first_end + frame_bytes);
    assert_eq!(u64::try_from(step.frame_bytes())?, frame_bytes);
    assert!(matches!(
        step.observation_outcome(),
        LocalLogObservationOutcome::ExactDuplicate {
            delivery_index: 1,
            first_delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        }
    ));
    let queue = step.into_queue();

    assert_eq!(queue.pending_frames(), 2);
    assert_eq!(queue.pending_bytes(), frame_bytes * 2);
    assert_eq!(queue.speculative_tail_end(), first_end + frame_bytes);
    assert_eq!(queue.speculative_cursor().owner().observation_count(), 2);
    assert_eq!(queue.speculative_cursor().owner().unique_event_count(), 1);
    assert_eq!(queue.speculative_cursor().owner().exact_duplicate_count(), 1);
    assert_eq!(
        queue.speculative_cursor().owner().next_sequence(),
        Some(LocalLogSequence::try_new(2)?)
    );
    assert!(matches!(
        queue.head_observation_outcome(),
        LocalLogObservationOutcome::Applied {
            delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        }
    ));

    let LocalLogStorageAppendQueueParts { head, followers, .. } = queue.into_parts();
    assert_eq!(followers.len(), 1);
    let duplicate = &followers[0];
    assert_eq!(duplicate.chunk_start().get(), first_end);
    assert_eq!(duplicate.frame_end(), first_end + frame_bytes);
    assert_eq!(head.frame().as_ref(), duplicate.frame().as_ref());
    assert_eq!(
        duplicate.observation(),
        LocalLogObservationOutcome::ExactDuplicate {
            delivery_index: 1,
            first_delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        }
    );
    Ok(())
}

#[test]
fn every_event_kind_remains_ordered_behind_one_blocked_head() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;
    let token = acquire_token(&fixture)?;
    let cursor = selected_cursor(&fixture)?;
    let mut producer = EditorSession::new(cursor.owner().session().state().clone());

    let first_commit = publish_insertion(&mut producer, "first", HistoryIntent::Record)?;
    let first =
        next_entry(&cursor, "replay:queue:all-kinds:commit", LocalLogEvent::commit(first_commit))?;
    let plan = token.try_prepare_append(cursor, &first)?;
    let head_pointer = plan.frame().as_ptr();
    let mut queue = plan.try_into_queue(LocalLogStorageAppendQueueLimits::new(6, u64::MAX))?;

    let undo = producer.undo()?.ok_or("queue-test undo was unexpectedly unavailable")?;
    let undo = next_entry(
        queue.speculative_cursor(),
        "replay:queue:all-kinds:undo",
        LocalLogEvent::try_undo(undo)?,
    )?;
    queue = queue.try_enqueue(&undo)?.into_queue();

    let redo = producer.redo()?.ok_or("queue-test redo was unexpectedly unavailable")?;
    let redo = next_entry(
        queue.speculative_cursor(),
        "replay:queue:all-kinds:redo",
        LocalLogEvent::try_redo(redo)?,
    )?;
    queue = queue.try_enqueue(&redo)?.into_queue();

    let group = QualifiedName::try_new("breditor/queue-all-kinds")?;
    let merge = publish_insertion(&mut producer, "merge", HistoryIntent::Merge { group })?;
    let merge = next_entry(
        queue.speculative_cursor(),
        "replay:queue:all-kinds:merge",
        LocalLogEvent::commit(merge),
    )?;
    queue = queue.try_enqueue(&merge)?.into_queue();

    producer.close_history_group();
    let close = next_entry(
        queue.speculative_cursor(),
        "replay:queue:all-kinds:close",
        LocalLogEvent::close_history_group(),
    )?;
    queue = queue.try_enqueue(&close)?.into_queue();

    producer.clear_history();
    let clear = next_entry(
        queue.speculative_cursor(),
        "replay:queue:all-kinds:clear",
        LocalLogEvent::clear_history(),
    )?;
    queue = queue.try_enqueue(&clear)?.into_queue();

    assert_eq!(queue.pending_frames(), 6);
    assert_eq!(queue.head_frame().as_ptr(), head_pointer);
    assert_eq!(queue.speculative_cursor().owner().observation_count(), 6);
    assert_eq!(queue.speculative_cursor().owner().unique_event_count(), 6);
    assert_eq!(queue.speculative_cursor().owner().applied_operation_count(), 4);
    assert_eq!(
        (
            queue.speculative_cursor().owner().session().undo_depth(),
            queue.speculative_cursor().owner().session().redo_depth()
        ),
        (0, 0)
    );
    assert_eq!(
        SessionCheckpointJsonCodec::new(fixture.context.clone())
            .encode(queue.speculative_cursor().owner().session())?,
        SessionCheckpointJsonCodec::new(fixture.context).encode(&producer)?
    );

    let codec = queue.speculative_cursor().frame_codec.clone();
    let LocalLogStorageAppendQueueParts { speculative_cursor: cursor, head, followers, .. } =
        queue.into_parts();
    assert_eq!(followers.len(), 5);
    let mut expected_start = head.frame_end();
    for (delivery_index, item) in followers.iter().enumerate() {
        assert_eq!(item.chunk_start().get(), expected_start);
        assert_eq!(item.observation().delivery_index(), u64::try_from(delivery_index + 1)?);
        assert!(item.observation().was_applied());
        expected_start = item.frame_end();
    }
    assert_eq!(expected_start, cursor.accepted_byte_offset());

    let expected_kinds = [
        LocalLogEventKind::Commit,
        LocalLogEventKind::Undo,
        LocalLogEventKind::Redo,
        LocalLogEventKind::Commit,
        LocalLogEventKind::CloseHistoryGroup,
        LocalLogEventKind::ClearHistory,
    ];
    for (item, expected_kind) in std::iter::once(&head).chain(followers.iter()).zip(expected_kinds)
    {
        let LocalLogFrameScan::Complete(frame) = codec.scan(item.frame().as_ref())? else {
            return Err("queued all-kinds frame did not scan as complete".into());
        };
        assert!(frame.remaining_bytes().is_empty());
        assert_eq!(codec.decode_frame(frame)?.event_kind(), expected_kind);
    }
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn enqueue_limit_precedence_and_semantic_failure_preserve_the_exact_queue() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Root)?;

    // Count saturation is checked before even an entry that cannot be encoded.
    let (plan, _) = prepare_plan(&fixture, "replay:queue:count-seed", "seed")?;
    let seed_bytes = u64::try_from(plan.frame_bytes())?;
    let queue = plan.try_into_queue(LocalLogStorageAppendQueueLimits::new(1, seed_bytes))?;
    let oversized = insertion_entry(
        queue.speculative_cursor(),
        "replay:queue:count-oversized",
        "x".repeat(6_000),
    )?;
    let snapshot = QueueSnapshot::capture(&queue);
    let failure = queue
        .try_enqueue(&oversized)
        .err()
        .ok_or("count-full queue unexpectedly encoded or admitted another entry")?;
    assert_eq!(failure.code(), LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameLimit);
    assert!(matches!(
        failure.error(),
        LocalLogStorageAppendQueueEnqueueError::PendingFrameLimit { attempted: 2, maximum: 1 }
    ));
    assert_eq!(failure.error().frame_error_code(), None);
    assert_eq!(failure.error().tail_error_code(), None);
    snapshot.assert_retained_by(failure.queue());
    assert!(!format!("{failure:?} {failure}").contains(PRIVATE_FRAME_PAYLOAD));
    assert_eq!(oversized.replay_id().as_str(), "replay:queue:count-oversized");

    // With count room, encoding is checked before the aggregate-byte ceiling.
    let (plan, _) = prepare_plan(&fixture, "replay:queue:encode-seed", "seed")?;
    let seed_bytes = u64::try_from(plan.frame_bytes())?;
    let queue = plan.try_into_queue(LocalLogStorageAppendQueueLimits::new(2, seed_bytes))?;
    let oversized = insertion_entry(
        queue.speculative_cursor(),
        "replay:queue:encode-oversized",
        "y".repeat(6_000),
    )?;
    let snapshot = QueueSnapshot::capture(&queue);
    let failure =
        queue.try_enqueue(&oversized).err().ok_or("oversized queued frame unexpectedly encoded")?;
    assert_eq!(failure.code(), LocalLogStorageAppendQueueEnqueueErrorCode::FrameEncode);
    assert_eq!(failure.error().frame_error_code(), Some(LocalLogFrameErrorCode::PayloadTooLarge));
    assert_eq!(failure.error().tail_error_code(), None);
    snapshot.assert_retained_by(failure.queue());

    // A byte-limit failure precedes semantic admission of an encoded sequence gap.
    let (plan, _) = prepare_plan(&fixture, "replay:queue:byte-seed", "seed")?;
    let seed_bytes = u64::try_from(plan.frame_bytes())?;
    let wrong_sequence = control_entry(
        plan.speculative_cursor(),
        "replay:queue:byte-gap",
        LocalLogSequence::try_new(3)?,
        LocalLogEvent::clear_history(),
    )?;
    let next_bytes =
        u64::try_from(plan.speculative_cursor().frame_codec.encode(&wrong_sequence)?.len())?;
    let byte_limit = seed_bytes + next_bytes - 1;
    let queue = plan.try_into_queue(LocalLogStorageAppendQueueLimits::new(2, byte_limit))?;
    let snapshot = QueueSnapshot::capture(&queue);
    let failure = queue
        .try_enqueue(&wrong_sequence)
        .err()
        .ok_or("byte-full queue unexpectedly attempted semantic admission")?;
    assert_eq!(failure.code(), LocalLogStorageAppendQueueEnqueueErrorCode::PendingByteLimit);
    assert!(matches!(
        failure.error(),
        LocalLogStorageAppendQueueEnqueueError::PendingByteLimit {
            attempted,
            maximum,
        } if *attempted == seed_bytes + next_bytes && *maximum == byte_limit
    ));
    assert_eq!(failure.error().tail_error_code(), None);
    snapshot.assert_retained_by(failure.queue());

    // With capacity available, the same class of semantic rejection is atomic,
    // and the recovered queue can still admit the exact next sequence.
    let (plan, _) = prepare_plan(&fixture, "replay:queue:semantic-seed", "seed")?;
    let queue = plan.try_into_queue(LocalLogStorageAppendQueueLimits::new(2, u64::MAX))?;
    let wrong_sequence = control_entry(
        queue.speculative_cursor(),
        "replay:queue:semantic-gap",
        LocalLogSequence::try_new(3)?,
        LocalLogEvent::close_history_group(),
    )?;
    let snapshot = QueueSnapshot::capture(&queue);
    let failure = queue
        .try_enqueue(&wrong_sequence)
        .err()
        .ok_or("nonadjacent queue sequence unexpectedly admitted")?;
    assert_eq!(failure.code(), LocalLogStorageAppendQueueEnqueueErrorCode::TailTransition);
    assert_eq!(failure.error().frame_error_code(), None);
    assert_eq!(failure.error().tail_error_code(), Some(LocalLogTailErrorCode::Admission));
    snapshot.assert_retained_by(failure.queue());
    let queue = failure.into_queue();
    let valid = insertion_entry(
        queue.speculative_cursor(),
        "replay:queue:semantic-valid",
        "valid successor",
    )?;
    let queue = queue.try_enqueue(&valid)?.into_queue();
    assert_eq!(queue.pending_frames(), 2);
    assert_eq!(queue.speculative_cursor().owner().observation_count(), 2);
    assert_eq!(queue.speculative_cursor().owner().unique_event_count(), 2);
    assert_eq!(wrong_sequence.replay_id().as_str(), "replay:queue:semantic-gap");
    Ok(())
}

#[test]
fn queue_and_failure_diagnostics_redact_frame_and_selection_payloads() -> TestResult {
    let fixture = SelectedRotationFixture::new(LocalLogStorageSelectionKind::Rotation)?;
    let (plan, _) = prepare_plan(&fixture, "replay:queue:redaction", PRIVATE_FRAME_PAYLOAD)?;
    assert!(String::from_utf8_lossy(plan.frame()).contains(PRIVATE_FRAME_PAYLOAD));
    assert!(plan.expected_binding().current_selection_json().contains(PRIVATE_SELECTION_PAYLOAD));
    let frame_bytes = u64::try_from(plan.frame_bytes())?;
    let queue = plan.try_into_queue(LocalLogStorageAppendQueueLimits::new(1, frame_bytes))?;

    let queue_debug = format!("{queue:?}");
    assert!(!queue_debug.contains(PRIVATE_FRAME_PAYLOAD));
    assert!(!queue_debug.contains(PRIVATE_SELECTION_PAYLOAD));
    assert!(!queue_debug.contains(fixture.selected.checkpoint_json()));

    let candidate = insertion_entry(
        queue.speculative_cursor(),
        "replay:queue:redaction-rejected",
        PRIVATE_FRAME_PAYLOAD,
    )?;
    let failure = queue
        .try_enqueue(&candidate)
        .err()
        .ok_or("full redaction-test queue unexpectedly accepted another frame")?;
    let failure_diagnostic = format!("{failure:?} {failure}");
    assert!(!failure_diagnostic.contains(PRIVATE_FRAME_PAYLOAD));
    assert!(!failure_diagnostic.contains(PRIVATE_SELECTION_PAYLOAD));
    assert!(!failure_diagnostic.contains(fixture.selected.checkpoint_json()));
    Ok(())
}

#[test]
fn queue_error_codes_and_non_nested_projections_are_stable() {
    for (code, spelling) in [
        (
            LocalLogStorageAppendQueueStartErrorCode::PendingFrameLimit,
            "local_log_storage_append_queue_start.pending_frame_limit",
        ),
        (
            LocalLogStorageAppendQueueStartErrorCode::PendingByteLimit,
            "local_log_storage_append_queue_start.pending_byte_limit",
        ),
    ] {
        assert_eq!(code.as_str(), spelling);
    }

    for (code, spelling) in [
        (
            LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameCountOverflow,
            "local_log_storage_append_queue_enqueue.pending_frame_count_overflow",
        ),
        (
            LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameLimit,
            "local_log_storage_append_queue_enqueue.pending_frame_limit",
        ),
        (
            LocalLogStorageAppendQueueEnqueueErrorCode::FrameEncode,
            "local_log_storage_append_queue_enqueue.frame_encode",
        ),
        (
            LocalLogStorageAppendQueueEnqueueErrorCode::FrameBytesOverflow,
            "local_log_storage_append_queue_enqueue.frame_bytes_overflow",
        ),
        (
            LocalLogStorageAppendQueueEnqueueErrorCode::PendingBytesOverflow,
            "local_log_storage_append_queue_enqueue.pending_bytes_overflow",
        ),
        (
            LocalLogStorageAppendQueueEnqueueErrorCode::PendingByteLimit,
            "local_log_storage_append_queue_enqueue.pending_byte_limit",
        ),
        (
            LocalLogStorageAppendQueueEnqueueErrorCode::TailTransition,
            "local_log_storage_append_queue_enqueue.tail_transition",
        ),
    ] {
        assert_eq!(code.as_str(), spelling);
    }

    let errors = [
        (
            LocalLogStorageAppendQueueEnqueueError::PendingFrameCountOverflow,
            LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameCountOverflow,
        ),
        (
            LocalLogStorageAppendQueueEnqueueError::PendingFrameLimit { attempted: 2, maximum: 1 },
            LocalLogStorageAppendQueueEnqueueErrorCode::PendingFrameLimit,
        ),
        (
            LocalLogStorageAppendQueueEnqueueError::FrameBytesOverflow { frame_bytes: usize::MAX },
            LocalLogStorageAppendQueueEnqueueErrorCode::FrameBytesOverflow,
        ),
        (
            LocalLogStorageAppendQueueEnqueueError::PendingBytesOverflow {
                current: u64::MAX,
                added: 1,
            },
            LocalLogStorageAppendQueueEnqueueErrorCode::PendingBytesOverflow,
        ),
        (
            LocalLogStorageAppendQueueEnqueueError::PendingByteLimit { attempted: 2, maximum: 1 },
            LocalLogStorageAppendQueueEnqueueErrorCode::PendingByteLimit,
        ),
    ];
    for (error, expected_code) in errors {
        assert_eq!(error.code(), expected_code);
        assert_eq!(error.frame_error_code(), None);
        assert_eq!(error.tail_error_code(), None);
    }
}
