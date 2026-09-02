//! Adversarial contracts for tail-prefix compaction ownership and precedence.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        LocalLogCheckpointJsonCodec, LocalLogCheckpointLimits, LocalLogFrameLimits,
        LocalLogTailCompactionOutcome, LocalLogTailCursor, SessionCheckpointJsonCodec,
    },
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionError, LocalLogCompactionErrorCode,
        LocalLogCompactionLimits, LocalLogEvent, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryLimits, LocalSessionId,
    },
    session::EditorSession,
    state::EditorContext,
    transaction::HistoryIntent,
};
use support::{
    TestResult,
    local_log::{apply, entry, insertion, state},
    local_log_tail::{empty_anchor, frame_codec},
    local_log_tail_compaction::TailCompactionFixture,
    test_error,
};

fn anchor_json(
    context: EditorContext,
    session_id: LocalSessionId,
    checkpoint_log: LocalLogId,
    successor_log: LocalLogId,
    anchor: &breditor_core::local_log::LocalLogCheckpointAnchor,
) -> Result<String, Box<dyn Error>> {
    let binding = LocalLogCheckpointBinding::try_new(session_id, checkpoint_log, successor_log)?;
    Ok(LocalLogCheckpointJsonCodec::new(context, binding)
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(u64::MAX))
        .encode(anchor)?)
}

fn assert_retained_cumulative_cursor(
    cursor: &LocalLogTailCursor,
    fixture: &CumulativeFixture,
) -> Result<(), Box<dyn Error>> {
    assert_eq!(cursor.accepted_byte_offset(), fixture.accepted_prefix_bytes);
    assert_eq!(cursor.frame_limits(), fixture.frame_limits);
    assert_eq!(cursor.owner().recovery_limits(), LocalLogRecoveryLimits::new(1, 1, 1));
    assert_eq!(cursor.owner().compaction_limits(), LocalLogCompactionLimits::new(1));
    assert_eq!(cursor.owner().compacted_replay_count(), 1);
    assert_eq!(cursor.owner().active_entries().len(), 1);
    assert_eq!(
        (
            cursor.owner().observation_count(),
            cursor.owner().unique_event_count(),
            cursor.owner().exact_duplicate_count(),
            cursor.owner().applied_operation_count(),
        ),
        (1, 1, 0, 1)
    );
    assert_eq!(
        SessionCheckpointJsonCodec::new(fixture.context.clone())
            .encode(cursor.owner().session())?,
        fixture.session_checkpoint
    );
    Ok(())
}

fn assert_reauthorized_outcome(
    outcome: LocalLogTailCompactionOutcome,
    fixture: &CumulativeFixture,
) {
    assert_eq!(outcome.accepted_prefix_bytes(), fixture.accepted_prefix_bytes);
    assert_eq!(outcome.frame_limits(), fixture.frame_limits);
    assert_eq!(outcome.anchor().checkpoint_log_id(), &fixture.active_log);
    assert_eq!(outcome.anchor().successor_log_id(), &fixture.successor_log);
    assert_eq!(outcome.anchor().compacted_replay_count(), 2);
    assert_eq!(outcome.anchor().compaction_limits(), LocalLogCompactionLimits::new(2));
    let outcome_debug = format!("{outcome:?}");
    assert!(outcome_debug.contains("accepted_prefix_bytes"));
    assert!(outcome_debug.contains("frame_limits"));
    assert!(!outcome_debug.contains("SECRET_CUMULATIVE"));
    assert!(!outcome_debug.contains("LocalLogCheckpointAnchor"));

    let (anchor, accepted_prefix_bytes, retained_frame_limits) = outcome.into_parts();
    assert_eq!(accepted_prefix_bytes, fixture.accepted_prefix_bytes);
    assert_eq!(retained_frame_limits, fixture.frame_limits);
    let new_recovery_limits = LocalLogRecoveryLimits::new(0, 0, 0);
    let new_frame_limits = LocalLogFrameLimits::new(17);
    let next = anchor.begin_successor_tail(new_recovery_limits, new_frame_limits);
    assert_eq!(next.accepted_byte_offset(), 0);
    assert_eq!(next.frame_limits(), new_frame_limits);
    assert_eq!(next.owner().recovery_limits(), new_recovery_limits);
    assert_eq!(next.owner().checkpoint_log_id(), &fixture.active_log);
    assert_eq!(next.owner().active_log_id(), &fixture.successor_log);
}

struct CumulativeFixture {
    context: EditorContext,
    predecessor_log: LocalLogId,
    active_log: LocalLogId,
    successor_log: LocalLogId,
    cursor: Option<LocalLogTailCursor>,
    accepted_prefix_bytes: u64,
    frame_limits: LocalLogFrameLimits,
    session_checkpoint: String,
}

impl CumulativeFixture {
    fn new() -> Result<Self, Box<dyn Error>> {
        let context = EditorContext::default();
        let initial = state(&context, "", "tail-compaction-cumulative")?;
        let session_id = LocalSessionId::try_new("session:tail-compaction:cumulative")?;
        let predecessor_log = LocalLogId::try_new("log:tail-compaction:cumulative:g0")?;
        let active_log = LocalLogId::try_new("log:tail-compaction:cumulative:g1")?;
        let successor_log = LocalLogId::try_new("log:tail-compaction:cumulative:g2")?;
        let mut producer = EditorSession::new(initial.clone());

        let first_transaction = insertion(producer.state(), 0, "A", HistoryIntent::Record)?;
        let first_commit = apply(&mut producer, &first_transaction)?;
        let recovered = LocalLogRecovery::new(session_id.clone(), predecessor_log.clone())
            .recover(
                EditorSession::new(initial),
                vec![entry(
                    &session_id,
                    &predecessor_log,
                    1,
                    "request:tail-compaction:cumulative:first",
                    LocalLogEvent::commit(first_commit),
                )?],
            )?;
        let anchor = recovered
            .try_into_checkpoint_anchor(active_log.clone(), LocalLogCompactionLimits::new(1))?;

        let second_transaction =
            insertion(producer.state(), 1, "SECRET_CUMULATIVE", HistoryIntent::Record)?;
        let second_commit = apply(&mut producer, &second_transaction)?;
        let second_entry = entry(
            &session_id,
            &active_log,
            2,
            "request:tail-compaction:cumulative:second",
            LocalLogEvent::commit(second_commit),
        )?;
        let frame = frame_codec(context.clone(), &session_id, &active_log).encode(&second_entry)?;
        let frame_limits = LocalLogFrameLimits::new(u64::MAX);
        let cursor =
            anchor.begin_successor_tail(LocalLogRecoveryLimits::new(1, 1, 1), frame_limits);
        let accepted = cursor.try_observe_frame(0, &frame)?;
        let accepted_prefix_bytes = u64::try_from(frame.len())?;
        let (cursor, _) = accepted.into_parts();
        let session_checkpoint =
            SessionCheckpointJsonCodec::new(context.clone()).encode(&producer)?;

        Ok(Self {
            context,
            predecessor_log,
            active_log,
            successor_log,
            cursor: Some(cursor),
            accepted_prefix_bytes,
            frame_limits,
            session_checkpoint,
        })
    }
}

#[test]
fn truncation_and_uninspected_complete_suffix_can_be_abandoned_only_at_the_accepted_prefix()
-> TestResult {
    let fixture = TailCompactionFixture::new("security-abandonment")?;
    let frame_limits = LocalLogFrameLimits::new(u64::MAX);
    let cursor = fixture.cursor(2, LocalLogRecoveryLimits::new(2, 2, 2), frame_limits)?;
    let mut supplied = fixture.first_frame.clone();
    supplied.extend_from_slice(&fixture.second_frame);

    let first = cursor.try_observe_frame(0, &supplied)?;
    let accepted_prefix_bytes = u64::try_from(fixture.first_frame.len())?;
    assert_eq!(first.cursor().accepted_byte_offset(), accepted_prefix_bytes);
    let (cursor, _) = first.into_parts();
    let partial_end = fixture
        .second_frame
        .len()
        .checked_sub(1)
        .ok_or_else(|| test_error("second frame unexpectedly had no bytes"))?;
    let truncated =
        cursor.try_observe_frame(accepted_prefix_bytes, &fixture.second_frame[..partial_end])?;
    assert!(truncated.status().truncation().is_some());
    assert_eq!(truncated.cursor().accepted_byte_offset(), accepted_prefix_bytes);
    let (cursor, _) = truncated.into_parts();

    let outcome = cursor.try_into_checkpoint_anchor(fixture.successor_log.clone())?;
    assert_eq!(outcome.accepted_prefix_bytes(), accepted_prefix_bytes);
    assert_eq!(outcome.frame_limits(), frame_limits);
    assert_eq!(outcome.anchor().compacted_replay_count(), 1);
    assert_eq!(
        SessionCheckpointJsonCodec::new(fixture.context).encode(outcome.anchor().session())?,
        fixture.after_first_checkpoint
    );
    Ok(())
}

#[test]
fn observing_an_empty_slice_is_not_a_compaction_precondition_or_extra_proof() -> TestResult {
    let fixture = TailCompactionFixture::new("security-empty-step")?;
    let frame_limits = LocalLogFrameLimits::new(u64::MAX);
    let make_cursor = || fixture.cursor(1, LocalLogRecoveryLimits::new(1, 1, 1), frame_limits);
    let direct_step = make_cursor()?.try_observe_frame(0, &fixture.first_frame)?;
    let (direct_cursor, _) = direct_step.into_parts();
    let direct = direct_cursor.try_into_checkpoint_anchor(fixture.successor_log.clone())?;

    let end_step = make_cursor()?.try_observe_frame(0, &fixture.first_frame)?;
    let accepted_prefix_bytes = u64::try_from(fixture.first_frame.len())?;
    let (cursor, _) = end_step.into_parts();
    let end = cursor.try_observe_frame(accepted_prefix_bytes, &[])?;
    assert!(end.status().is_end_of_input());
    let (cursor, _) = end.into_parts();
    let after_empty = cursor.try_into_checkpoint_anchor(fixture.successor_log.clone())?;

    assert_eq!(direct.accepted_prefix_bytes(), after_empty.accepted_prefix_bytes());
    assert_eq!(direct.frame_limits(), after_empty.frame_limits());
    assert_eq!(
        anchor_json(
            fixture.context.clone(),
            fixture.session_id.clone(),
            fixture.active_log.clone(),
            fixture.successor_log.clone(),
            direct.anchor(),
        )?,
        anchor_json(
            fixture.context,
            fixture.session_id,
            fixture.active_log,
            fixture.successor_log,
            after_empty.anchor(),
        )?
    );
    Ok(())
}

#[test]
fn generation_and_cumulative_limit_failures_return_the_exact_nonzero_cursor_for_retry() -> TestResult
{
    let mut fixture = CumulativeFixture::new()?;
    let cursor = fixture
        .cursor
        .take()
        .ok_or_else(|| test_error("cumulative fixture cursor was already consumed"))?;

    let same_active = cursor
        .try_into_checkpoint_anchor(fixture.active_log.clone())
        .err()
        .ok_or_else(|| test_error("same active generation unexpectedly compacted"))?;
    assert_eq!(same_active.code(), LocalLogCompactionErrorCode::GenerationNotAdvanced);
    assert!(matches!(
        same_active.error(),
        LocalLogCompactionError::GenerationNotAdvanced {
            checkpoint_log_id,
            successor_log_id,
        } if checkpoint_log_id == &fixture.active_log && successor_log_id == &fixture.active_log
    ));
    assert_retained_cumulative_cursor(same_active.owner(), &fixture)?;
    let debug = format!("{same_active:?}");
    assert!(!debug.contains("SECRET_CUMULATIVE"));
    assert!(!debug.contains("LocalLogTailCursor"));
    let display = same_active.to_string();
    assert!(!display.contains("SECRET_CUMULATIVE"));
    assert!(!display.contains("LocalLogTailCursor"));
    let (cursor, _) = same_active.into_parts();

    let predecessor = cursor
        .try_into_checkpoint_anchor(fixture.predecessor_log.clone())
        .err()
        .ok_or_else(|| test_error("immediate predecessor generation unexpectedly compacted"))?;
    assert_eq!(predecessor.code(), LocalLogCompactionErrorCode::KnownGenerationReuse);
    assert_retained_cumulative_cursor(predecessor.owner(), &fixture)?;
    let (cursor, _) = predecessor.into_parts();

    // The explicit path must preserve generation precedence even though its
    // replacement ceiling would independently reject the cumulative set.
    let explicit_same_active = cursor
        .try_into_checkpoint_anchor_with_compaction_limits(
            fixture.active_log.clone(),
            LocalLogCompactionLimits::new(0),
        )
        .err()
        .ok_or_else(|| test_error("explicit same active generation unexpectedly compacted"))?;
    assert_eq!(explicit_same_active.code(), LocalLogCompactionErrorCode::GenerationNotAdvanced);
    assert_retained_cumulative_cursor(explicit_same_active.owner(), &fixture)?;
    let (cursor, _) = explicit_same_active.into_parts();

    let explicit_predecessor = cursor
        .try_into_checkpoint_anchor_with_compaction_limits(
            fixture.predecessor_log.clone(),
            LocalLogCompactionLimits::new(0),
        )
        .err()
        .ok_or_else(|| test_error("explicit predecessor generation unexpectedly compacted"))?;
    assert_eq!(explicit_predecessor.code(), LocalLogCompactionErrorCode::KnownGenerationReuse);
    assert_retained_cumulative_cursor(explicit_predecessor.owner(), &fixture)?;
    let (cursor, _) = explicit_predecessor.into_parts();

    let inherited_limit = cursor
        .try_into_checkpoint_anchor(fixture.successor_log.clone())
        .err()
        .ok_or_else(|| test_error("inherited cumulative limit unexpectedly compacted"))?;
    assert!(matches!(
        inherited_limit.error(),
        LocalLogCompactionError::ReplayTombstoneLimit {
            compacted: 1,
            active: 1,
            attempted: 2,
            maximum: 1,
        }
    ));
    assert_retained_cumulative_cursor(inherited_limit.owner(), &fixture)?;
    let (cursor, _) = inherited_limit.into_parts();

    let insufficient = cursor
        .try_into_checkpoint_anchor_with_compaction_limits(
            fixture.successor_log.clone(),
            LocalLogCompactionLimits::new(1),
        )
        .err()
        .ok_or_else(|| test_error("insufficient replacement limit unexpectedly compacted"))?;
    assert_eq!(insufficient.code(), LocalLogCompactionErrorCode::ReplayTombstoneLimit);
    assert_retained_cumulative_cursor(insufficient.owner(), &fixture)?;
    let (cursor, _) = insufficient.into_parts();

    let outcome = cursor.try_into_checkpoint_anchor_with_compaction_limits(
        fixture.successor_log.clone(),
        LocalLogCompactionLimits::new(2),
    )?;
    assert_reauthorized_outcome(outcome, &fixture);
    Ok(())
}

#[test]
fn empty_cursor_at_maximum_trusted_offset_compacts_without_offset_arithmetic() -> TestResult {
    let fixture = TailCompactionFixture::new("security-max-empty")?;
    let frame_limits = LocalLogFrameLimits::new(7);
    let cursor = empty_anchor(
        fixture.initial,
        &fixture.session_id,
        &fixture.checkpoint_log,
        &fixture.active_log,
        0,
    )?
    .begin_successor_tail(LocalLogRecoveryLimits::new(0, 0, 0), frame_limits);
    let (owner, _, retained_limits) = cursor.into_parts();
    let cursor = LocalLogTailCursor::from_trusted_parts(owner, u64::MAX, retained_limits);

    let same_active = cursor
        .try_into_checkpoint_anchor(fixture.active_log.clone())
        .err()
        .ok_or_else(|| test_error("same generation unexpectedly compacted at u64::MAX"))?;
    assert_eq!(same_active.code(), LocalLogCompactionErrorCode::GenerationNotAdvanced);
    assert_eq!(same_active.owner().accepted_byte_offset(), u64::MAX);
    assert_eq!(same_active.owner().frame_limits(), frame_limits);
    assert_eq!(same_active.owner().owner().observation_count(), 0);
    let (cursor, _) = same_active.into_parts();

    let outcome = cursor.try_into_checkpoint_anchor(fixture.successor_log.clone())?;
    assert_eq!(outcome.accepted_prefix_bytes(), u64::MAX);
    assert_eq!(outcome.frame_limits(), frame_limits);
    assert_eq!(outcome.anchor().checkpoint_log_id(), &fixture.active_log);
    assert_eq!(outcome.anchor().successor_log_id(), &fixture.successor_log);
    assert_eq!(outcome.anchor().compacted_replay_count(), 0);
    assert_eq!(outcome.anchor().checkpoint_covered_through(), None);

    let (anchor, accepted_prefix_bytes, retained_frame_limits) = outcome.into_parts();
    assert_eq!(accepted_prefix_bytes, u64::MAX);
    assert_eq!(retained_frame_limits, frame_limits);
    let next = anchor
        .begin_successor_tail(LocalLogRecoveryLimits::new(0, 0, 0), LocalLogFrameLimits::new(9));
    assert_eq!(next.accepted_byte_offset(), 0);
    assert_eq!(next.frame_limits(), LocalLogFrameLimits::new(9));
    Ok(())
}
