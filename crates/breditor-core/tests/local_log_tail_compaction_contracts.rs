//! Black-box contracts for compacting one accepted framed tail prefix.

mod support;

use breditor_core::{
    codec::{
        LocalLogFrameCodecError, LocalLogFrameErrorCode, LocalLogFrameLimits,
        LocalLogTailErrorCode, SessionCheckpointJsonCodec,
    },
    local_log::{
        LocalLogEvent, LocalLogObservationOutcome, LocalLogRecoveryLimits, LocalLogSequence,
        ReplayId,
    },
    transaction::HistoryIntent,
};
use support::{
    TestResult,
    local_log::{entry, insertion},
    local_log_tail::frame_codec,
    local_log_tail_compaction::TailCompactionFixture,
    test_error,
};

#[test]
fn applied_and_byte_different_duplicate_compact_with_exact_accepted_prefix_metadata() -> TestResult
{
    let fixture = TailCompactionFixture::new("contracts-metadata")?;
    let frame_limits = LocalLogFrameLimits::new(u64::MAX);
    let cursor = fixture.cursor(1, LocalLogRecoveryLimits::new(2, 1, 1), frame_limits)?;

    assert_ne!(fixture.first_frame, fixture.duplicate_frame);
    let first = cursor.try_observe_frame(0, &fixture.first_frame)?;
    assert_eq!(
        first.status().observation_outcome(),
        Some(LocalLogObservationOutcome::Applied {
            delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        })
    );
    let first_end = u64::try_from(fixture.first_frame.len())?;
    let (cursor, _) = first.into_parts();
    let duplicate = cursor.try_observe_frame(first_end, &fixture.duplicate_frame)?;
    assert_eq!(
        duplicate.status().observation_outcome(),
        Some(LocalLogObservationOutcome::ExactDuplicate {
            delivery_index: 1,
            first_delivery_index: 0,
            sequence: LocalLogSequence::FIRST,
        })
    );
    let accepted_prefix_bytes = first_end
        .checked_add(u64::try_from(fixture.duplicate_frame.len())?)
        .ok_or_else(|| test_error("compaction contract prefix overflowed"))?;
    let (cursor, _) = duplicate.into_parts();

    let outcome = cursor.try_into_checkpoint_anchor(fixture.successor_log.clone())?;
    assert_eq!(outcome.accepted_prefix_bytes(), accepted_prefix_bytes);
    assert_eq!(outcome.frame_limits(), frame_limits);
    assert_eq!(outcome.anchor().checkpoint_log_id(), &fixture.active_log);
    assert_eq!(outcome.anchor().successor_log_id(), &fixture.successor_log);
    assert_eq!(outcome.anchor().checkpoint_covered_through(), Some(LocalLogSequence::FIRST));
    assert_eq!(outcome.anchor().compacted_replay_count(), 1);
    assert_eq!(
        outcome.anchor().compacted_sequence_for_replay_id(&ReplayId::try_new(
            "request:tail-compaction:contracts-metadata:first",
        )?),
        Some(LocalLogSequence::FIRST)
    );
    assert_eq!(
        SessionCheckpointJsonCodec::new(fixture.context.clone())
            .encode(outcome.anchor().session())?,
        fixture.after_first_checkpoint
    );

    let (anchor, retained_prefix, retained_frame_limits) = outcome.into_parts();
    assert_eq!(retained_prefix, accepted_prefix_bytes);
    assert_eq!(retained_frame_limits, frame_limits);
    assert_eq!(anchor.compacted_replay_count(), 1);
    Ok(())
}

#[test]
fn successor_cursor_selects_new_policies_resets_origin_and_derives_the_new_binding() -> TestResult {
    let fixture = TailCompactionFixture::new("contracts-successor")?;
    let old_frame_limits = LocalLogFrameLimits::new(u64::MAX);
    let old_recovery_limits = LocalLogRecoveryLimits::new(3, 2, 2);
    let cursor = fixture.cursor(2, old_recovery_limits, old_frame_limits)?;
    let accepted = cursor.try_observe_frame(0, &fixture.first_frame)?;
    let old_prefix = u64::try_from(fixture.first_frame.len())?;
    let (cursor, _) = accepted.into_parts();
    let outcome = cursor.try_into_checkpoint_anchor(fixture.successor_log.clone())?;
    let (anchor, retained_prefix, retained_frame_limits) = outcome.into_parts();
    assert_eq!(retained_prefix, old_prefix);
    assert_eq!(retained_frame_limits, old_frame_limits);

    let new_recovery_limits = LocalLogRecoveryLimits::new(1, 1, 1);
    let new_frame_limits = LocalLogFrameLimits::new(u64::MAX - 1);
    let next = anchor.begin_successor_tail(new_recovery_limits, new_frame_limits);
    assert_eq!(next.accepted_byte_offset(), 0);
    assert_eq!(next.frame_limits(), new_frame_limits);
    assert_eq!(next.owner().recovery_limits(), new_recovery_limits);
    assert_eq!(next.owner().checkpoint_log_id(), &fixture.active_log);
    assert_eq!(next.owner().active_log_id(), &fixture.successor_log);

    let wrong_origin = next
        .try_observe_frame(old_prefix, &[])
        .err()
        .ok_or_else(|| test_error("old generation origin was accepted by the successor"))?;
    assert_eq!(wrong_origin.code(), LocalLogTailErrorCode::InputOriginMismatch);
    let (next, rejected_entry, _) = wrong_origin.into_parts();
    assert!(rejected_entry.is_none());

    let old_binding = next
        .try_observe_frame(0, &fixture.first_frame)
        .err()
        .ok_or_else(|| test_error("old generation frame was accepted by the successor"))?;
    assert_eq!(old_binding.code(), LocalLogTailErrorCode::FrameDecode);
    assert_eq!(
        old_binding.error().frame_decode_error().map(LocalLogFrameCodecError::code),
        Some(LocalLogFrameErrorCode::ActiveLogMismatch)
    );
    let (next, rejected_entry, _) = old_binding.into_parts();
    assert!(rejected_entry.is_none());

    let transaction = insertion(next.owner().session().state(), 1, "C", HistoryIntent::Record)?;
    let commit = transaction
        .apply(&fixture.context, next.owner().session().state())?
        .into_commit()
        .ok_or_else(|| test_error("successor transaction unexpectedly remained unchanged"))?;
    let successor_entry = entry(
        &fixture.session_id,
        &fixture.successor_log,
        2,
        "request:tail-compaction:contracts-successor:next",
        LocalLogEvent::commit(commit),
    )?;
    let successor_frame =
        frame_codec(fixture.context.clone(), &fixture.session_id, &fixture.successor_log)
            .encode(&successor_entry)?;
    let accepted = next.try_observe_frame(0, &successor_frame)?;
    assert_eq!(
        accepted.status().observation_outcome(),
        Some(LocalLogObservationOutcome::Applied {
            delivery_index: 0,
            sequence: LocalLogSequence::try_new(2)?,
        })
    );
    assert_eq!(accepted.cursor().accepted_byte_offset(), u64::try_from(successor_frame.len())?);
    Ok(())
}
