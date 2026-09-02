//! Black-box contracts for atomic framed active-tail observation.

mod support;

use breditor_core::{
    codec::{
        LocalLogEntryJsonCodec, LocalLogFrameLimits, LocalLogTailCursor, LocalLogTailStatus,
        SessionCheckpointJsonCodec,
    },
    local_log::{
        LocalLogEvent, LocalLogId, LocalLogObservationOutcome, LocalLogRecoveryLimits,
        LocalLogSequence, LocalSessionId,
    },
    session::EditorSession,
    state::{EditorContext, EditorState},
    transaction::HistoryIntent,
};
use support::{
    TestResult,
    local_log::{apply, entry, insertion, state},
    local_log_tail::{empty_anchor, frame_codec, raw_frame},
    test_error,
};

fn assert_fresh_cursor(
    cursor: &LocalLogTailCursor,
    session_id: &LocalSessionId,
    active_log: &LocalLogId,
    frame_limits: LocalLogFrameLimits,
) {
    assert_eq!(cursor.accepted_byte_offset(), 0);
    assert_eq!(cursor.frame_limits(), frame_limits);
    assert_eq!(cursor.owner().session_id(), session_id);
    assert_eq!(cursor.owner().active_log_id(), active_log);
}

struct FramedTrace {
    producer: EditorSession,
    first_frame: Vec<u8>,
    duplicate_frame: Vec<u8>,
    second_frame: Vec<u8>,
    tail: Vec<u8>,
}

fn framed_trace(
    context: &EditorContext,
    initial: EditorState,
    session_id: &LocalSessionId,
    active_log: &LocalLogId,
) -> Result<FramedTrace, Box<dyn std::error::Error>> {
    let mut producer = EditorSession::new(initial);
    let first_transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
    let first_commit = apply(&mut producer, &first_transaction)?;
    let first_entry = entry(
        session_id,
        active_log,
        1,
        "request:tail:first",
        LocalLogEvent::commit(first_commit),
    )?;
    let second_transaction = insertion(producer.state(), 1, "B", HistoryIntent::Record)?;
    let second_commit = apply(&mut producer, &second_transaction)?;
    let second_entry = entry(
        session_id,
        active_log,
        2,
        "request:tail:second",
        LocalLogEvent::commit(second_commit),
    )?;
    let encoder = frame_codec(context.clone(), session_id, active_log);
    let first_frame = encoder.encode(&first_entry)?;
    let first_json = LocalLogEntryJsonCodec::new(context.clone()).encode(&first_entry)?;
    let duplicate_frame = raw_frame(format!(" \n{first_json}\t").as_bytes())?;
    let second_frame = encoder.encode(&second_entry)?;
    let mut tail = first_frame.clone();
    tail.extend_from_slice(&duplicate_frame);
    tail.extend_from_slice(&second_frame);
    Ok(FramedTrace { producer, first_frame, duplicate_frame, second_frame, tail })
}

#[test]
fn concatenated_applied_duplicate_and_applied_frames_advance_one_joint_cursor() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "", "tail-cursor-contract")?;
    let session_id = LocalSessionId::try_new("session:tail-cursor-contract")?;
    let checkpoint_log = LocalLogId::try_new("log:tail-cursor-contract:g0")?;
    let active_log = LocalLogId::try_new("log:tail-cursor-contract:g1")?;
    let limits = LocalLogRecoveryLimits::new(3, 2, 2);
    let frame_limits = LocalLogFrameLimits::default();
    let cursor = empty_anchor(initial.clone(), &session_id, &checkpoint_log, &active_log, 2)?
        .begin_successor_tail(limits, frame_limits);
    assert_fresh_cursor(&cursor, &session_id, &active_log, frame_limits);

    let FramedTrace { producer, first_frame, duplicate_frame, second_frame, tail } =
        framed_trace(&context, initial, &session_id, &active_log)?;
    assert_ne!(duplicate_frame.len(), first_frame.len());

    let first = cursor.try_observe_frame(0, &tail)?;
    let first_status = first.status();
    assert_eq!(first_status.accepted_range(), Some((0, u64::try_from(first_frame.len())?)));
    assert_eq!(first_status.frame_bytes(), Some(first_frame.len()));
    assert_eq!(
        first_status.observation_outcome(),
        Some(LocalLogObservationOutcome::Applied {
            delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        })
    );
    let (first_cursor, _) = first.into_parts();

    let (owner, accepted, retained_frame_limits) = first_cursor.into_parts();
    let cursor = LocalLogTailCursor::from_trusted_parts(owner, accepted, retained_frame_limits);
    let first_end = first_frame.len();
    let duplicate = cursor.try_observe_frame(accepted, &tail[first_end..])?;
    let duplicate_status = duplicate.status();
    let duplicate_end = first_end
        .checked_add(duplicate_frame.len())
        .ok_or_else(|| test_error("duplicate test boundary overflowed"))?;
    assert_eq!(duplicate_status.frame_bytes(), Some(duplicate_frame.len()));
    assert_eq!(
        duplicate_status.accepted_range(),
        Some((u64::try_from(first_end)?, u64::try_from(duplicate_end)?))
    );
    assert_eq!(
        duplicate_status.observation_outcome(),
        Some(LocalLogObservationOutcome::ExactDuplicate {
            delivery_index: 1,
            first_delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        })
    );
    let (cursor, _) = duplicate.into_parts();

    let final_step =
        cursor.try_observe_frame(u64::try_from(duplicate_end)?, &tail[duplicate_end..])?;
    let final_status = final_step.status();
    assert_eq!(final_status.frame_bytes(), Some(second_frame.len()));
    assert_eq!(
        final_status.observation_outcome(),
        Some(LocalLogObservationOutcome::Applied {
            delivery_index: 2,
            sequence: LocalLogSequence::try_new(2)?,
        })
    );
    let (cursor, _) = final_step.into_parts();
    assert_eq!(cursor.accepted_byte_offset(), u64::try_from(tail.len())?);
    assert_eq!(
        (
            cursor.owner().observation_count(),
            cursor.owner().unique_event_count(),
            cursor.owner().exact_duplicate_count(),
            cursor.owner().applied_operation_count(),
        ),
        (3, 2, 1, 2)
    );
    assert_eq!(
        SessionCheckpointJsonCodec::new(context).encode(cursor.owner().session())?,
        SessionCheckpointJsonCodec::new(producer.state().context().clone()).encode(&producer)?,
    );

    let end = cursor.try_observe_frame(u64::try_from(tail.len())?, &[])?;
    assert!(end.status().is_end_of_input());
    assert_eq!(end.cursor().accepted_byte_offset(), u64::try_from(tail.len())?);
    assert!(matches!(end.status(), LocalLogTailStatus::EndOfInput));
    Ok(())
}
