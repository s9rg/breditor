//! Adversarial contracts for repeated checkpoint compaction and lifetime policy.

mod support;

use breditor_core::{
    codec::{DocumentJsonCodec, SessionCheckpointJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        ContinuedLocalLog, LocalLogCompactionError, LocalLogCompactionErrorCode,
        LocalLogCompactionLimits, LocalLogEntry, LocalLogEvent, LocalLogId, LocalLogRecovery,
        LocalLogRecoveryError, LocalLogRecoveryErrorCode, LocalLogRecoveryLimits, LocalLogSequence,
        LocalSessionId, RecoveredLocalLog, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const PRIVATE_TEXT: &str = "PRIVATE_REPEATED_COMPACTION_DOCUMENT";
const PRIVATE_REPLAY: &str = "request:PRIVATE_REPEATED_COMPACTION_REPLAY";

struct Fixture {
    context: EditorContext,
    session_id: LocalSessionId,
    g0: LocalLogId,
    g1: LocalLogId,
    g2: LocalLogId,
    continued: ContinuedLocalLog,
}

fn state(
    context: &EditorContext,
    lineage: &str,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&[text_node("x", false)])]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn insertion(state: &EditorState, text: &str) -> Result<Transaction, Box<dyn std::error::Error>> {
    let start = TextOffset::try_new(0)?;
    let range = TextRange::try_new(path(&[0])?, start, start)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn apply(
    session: &mut EditorSession,
    transaction: &Transaction,
) -> Result<Commit, Box<dyn std::error::Error>> {
    session
        .apply_transaction(transaction)?
        .into_commit()
        .ok_or_else(|| test_error("transaction unexpectedly remained unchanged").into())
}

fn entry(
    session_id: &LocalSessionId,
    log_id: &LocalLogId,
    sequence: u64,
    replay_id: &str,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, Box<dyn std::error::Error>> {
    Ok(LocalLogEntry::new(
        session_id.clone(),
        log_id.clone(),
        LocalLogSequence::try_new(sequence)?,
        ReplayId::try_new(replay_id)?,
        event,
    ))
}

fn recovered_two(
    context: &EditorContext,
    session_id: &LocalSessionId,
    g0: &LocalLogId,
) -> Result<RecoveredLocalLog, Box<dyn std::error::Error>> {
    let initial = state(context, "repeated-security")?;
    let mut producer = EditorSession::new(initial.clone());
    let first = insertion(producer.state(), "A")?;
    let first = apply(&mut producer, &first)?;
    let second = insertion(producer.state(), PRIVATE_TEXT)?;
    let second = apply(&mut producer, &second)?;
    LocalLogRecovery::new(session_id.clone(), g0.clone())
        .recover(
            EditorSession::new(initial),
            vec![
                entry(session_id, g0, 1, "request:prefix-first", LocalLogEvent::commit(first))?,
                entry(session_id, g0, 2, PRIVATE_REPLAY, LocalLogEvent::commit(second))?,
            ],
        )
        .map_err(Into::into)
}

fn fixture(inherited_limit: u64) -> Result<Fixture, Box<dyn std::error::Error>> {
    let context = EditorContext::default();
    let session_id = LocalSessionId::try_new("session:repeated-security")?;
    let g0 = LocalLogId::try_new("log:security-g0")?;
    let g1 = LocalLogId::try_new("log:security-g1")?;
    let g2 = LocalLogId::try_new("log:security-g2")?;
    let recovered = recovered_two(&context, &session_id, &g0)?;
    let anchor = recovered
        .try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(inherited_limit))?;

    let third_before = anchor.session().state().clone();
    let third_transaction = insertion(&third_before, "C")?;
    let third = third_transaction
        .apply(&context, &third_before)?
        .into_commit()
        .ok_or_else(|| test_error("third transaction unexpectedly remained unchanged"))?;
    let third_retry = third_transaction
        .apply(&context, &third_before)?
        .into_commit()
        .ok_or_else(|| test_error("third retry unexpectedly remained unchanged"))?;
    let fourth_before = third.after().clone();
    let fourth_transaction = insertion(&fourth_before, "D")?;
    let fourth = fourth_transaction
        .apply(&context, &fourth_before)?
        .into_commit()
        .ok_or_else(|| test_error("fourth transaction unexpectedly remained unchanged"))?;

    let continued = anchor.recover_successor(
        vec![
            entry(&session_id, &g1, 3, "request:active-third", LocalLogEvent::commit(third))?,
            entry(&session_id, &g1, 3, "request:active-third", LocalLogEvent::commit(third_retry))?,
            entry(&session_id, &g1, 4, "request:active-fourth", LocalLogEvent::commit(fourth))?,
        ],
        LocalLogRecoveryLimits::default(),
    )?;
    Ok(Fixture { context, session_id, g0, g1, g2, continued })
}

#[test]
fn cumulative_limit_failure_returns_owner_and_explicit_reauthorization_succeeds() -> TestResult {
    let Fixture { context, session_id: _, g0, g1, g2, continued } = fixture(3)?;
    let session_codec = SessionCheckpointJsonCodec::new(context);
    let before = session_codec.encode(continued.session())?;

    // Generation checks precede the already-known cumulative limit failure.
    let failure = continued
        .try_into_checkpoint_anchor(g1.clone())
        .err()
        .ok_or_else(|| test_error("same active generation unexpectedly compacted"))?;
    assert_eq!(failure.code(), LocalLogCompactionErrorCode::GenerationNotAdvanced);
    let continued = failure.into_owner();
    let failure = continued
        .try_into_checkpoint_anchor(g0)
        .err()
        .ok_or_else(|| test_error("known predecessor generation unexpectedly reused"))?;
    assert_eq!(failure.code(), LocalLogCompactionErrorCode::KnownGenerationReuse);
    let continued = failure.into_owner();

    let failure = continued
        .try_into_checkpoint_anchor(g2.clone())
        .err()
        .ok_or_else(|| test_error("cumulative lifetime excess unexpectedly compacted"))?;
    assert_eq!(failure.code(), LocalLogCompactionErrorCode::ReplayTombstoneLimit);
    let rendered = format!("{failure:?} {failure}");
    assert!(!rendered.contains(PRIVATE_TEXT));
    assert!(!rendered.contains(PRIVATE_REPLAY));
    assert!(!rendered.contains("ContinuedLocalLog"));
    assert!(!rendered.contains(g1.as_str()));
    assert!(!rendered.contains(g2.as_str()));
    let (continued, error) = failure.into_parts();
    assert_eq!(session_codec.encode(continued.session())?, before);
    assert_eq!(continued.represented_replay_count(), 4);
    assert_eq!(continued.compacted_replay_count(), 2);
    assert_eq!(continued.active_entries().len(), 2);
    let LocalLogCompactionError::ReplayTombstoneLimit { compacted, active, attempted, maximum } =
        error
    else {
        return Err(test_error("cumulative failure used the wrong variant").into());
    };
    assert_eq!((compacted, active, attempted, maximum), (2, 2, 4, 3));

    let anchor =
        continued.try_into_checkpoint_anchor_with_limits(g2, LocalLogCompactionLimits::new(4))?;
    assert_eq!(anchor.compacted_replay_count(), 4);
    assert_eq!(anchor.compaction_limits().max_replay_tombstones(), 4);
    Ok(())
}

#[test]
fn first_compaction_limit_is_exact_and_failure_preserves_full_proofs() -> TestResult {
    let context = EditorContext::default();
    let session_id = LocalSessionId::try_new("session:first-cap")?;
    let g0 = LocalLogId::try_new("log:first-cap-g0")?;
    let g1 = LocalLogId::try_new("log:first-cap-g1")?;
    let recovered = recovered_two(&context, &session_id, &g0)?;

    let failure = recovered
        .try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(1))
        .err()
        .ok_or_else(|| test_error("first compaction ignored its lifetime limit"))?;
    assert_eq!(failure.code(), LocalLogCompactionErrorCode::ReplayTombstoneLimit);
    assert_eq!(failure.owner().entries().len(), 2);
    assert_eq!(failure.owner().represented_replay_count(), 2);
    let recovered = failure.into_owner();
    let anchor = recovered.try_into_checkpoint_anchor(g1, LocalLogCompactionLimits::new(2))?;
    assert_eq!(anchor.compacted_replay_count(), 2);
    Ok(())
}

#[test]
fn old_and_new_generation_replays_both_fail_before_sequence_budget_or_application() -> TestResult {
    for (replay_id, checkpoint_sequence) in
        [("request:prefix-first", 1), ("request:active-third", 3)]
    {
        let Fixture { session_id, g2, continued, .. } = fixture(4)?;
        let anchor = continued.try_into_checkpoint_anchor(g2.clone())?;
        let error = anchor
            .recover_successor(
                vec![entry(&session_id, &g2, 99, replay_id, LocalLogEvent::close_history_group())?],
                LocalLogRecoveryLimits::new(1, 0, 0),
            )
            .err()
            .ok_or_else(|| test_error("compacted replay unexpectedly reached application"))?;
        assert_eq!(error.code(), LocalLogRecoveryErrorCode::CompactedReplayId);
        let LocalLogRecoveryError::CompactedReplayId {
            replay_id: actual,
            checkpoint_sequence: actual_sequence,
            ..
        } = error
        else {
            return Err(test_error("compacted replay used the wrong error variant").into());
        };
        assert_eq!(actual.as_str(), replay_id);
        assert_eq!(actual_sequence, LocalLogSequence::try_new(checkpoint_sequence)?);
    }
    Ok(())
}

#[test]
fn membership_still_precedes_replay_lookup_after_repeated_compaction() -> TestResult {
    let Fixture { g2, continued, .. } = fixture(4)?;
    let anchor = continued.try_into_checkpoint_anchor(g2.clone())?;
    let error = anchor
        .recover_successor(
            vec![entry(
                &LocalSessionId::try_new("session:foreign-after-recompaction")?,
                &g2,
                5,
                "request:prefix-first",
                LocalLogEvent::close_history_group(),
            )?],
            LocalLogRecoveryLimits::new(1, 0, 0),
        )
        .err()
        .ok_or_else(|| test_error("foreign session reached recompacted replay lookup"))?;
    assert_eq!(error.code(), LocalLogRecoveryErrorCode::SessionMismatch);

    let Fixture { session_id, g2, continued, .. } = fixture(4)?;
    let anchor = continued.try_into_checkpoint_anchor(g2)?;
    let error = anchor
        .recover_successor(
            vec![entry(
                &session_id,
                &LocalLogId::try_new("log:foreign-after-recompaction")?,
                5,
                "request:prefix-first",
                LocalLogEvent::close_history_group(),
            )?],
            LocalLogRecoveryLimits::new(1, 0, 0),
        )
        .err()
        .ok_or_else(|| test_error("foreign log reached recompacted replay lookup"))?;
    assert_eq!(error.code(), LocalLogRecoveryErrorCode::ActiveLogMismatch);
    Ok(())
}

#[test]
fn exact_active_retry_becomes_fail_closed_compacted_reuse_after_rotation() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "exact-retry-downgrade")?;
    let mut producer = EditorSession::new(initial.clone());
    let session_id = LocalSessionId::try_new("session:exact-retry-downgrade")?;
    let g0 = LocalLogId::try_new("log:exact-retry-g0")?;
    let g1 = LocalLogId::try_new("log:exact-retry-g1")?;
    let g2 = LocalLogId::try_new("log:exact-retry-g2")?;
    let transaction = insertion(producer.state(), "open")?.with_metadata(TransactionMetadata::new(
        None,
        HistoryIntent::Merge { group: QualifiedName::try_new("breditor/exact-retry-downgrade")? },
    ));
    let commit = apply(&mut producer, &transaction)?;
    let recovered = LocalLogRecovery::new(session_id.clone(), g0.clone()).recover(
        EditorSession::new(initial),
        vec![entry(&session_id, &g0, 1, "request:open-group", LocalLogEvent::commit(commit))?],
    )?;
    let anchor =
        recovered.try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(2))?;
    let continued = anchor.recover_successor(
        vec![
            entry(
                &session_id,
                &g1,
                2,
                "request:exact-close",
                LocalLogEvent::close_history_group(),
            )?,
            entry(
                &session_id,
                &g1,
                2,
                "request:exact-close",
                LocalLogEvent::close_history_group(),
            )?,
        ],
        LocalLogRecoveryLimits::default(),
    )?;
    assert_eq!(continued.exact_duplicate_count(), 1);
    let anchor = continued.try_into_checkpoint_anchor(g2.clone())?;
    let error = anchor
        .recover_successor(
            vec![entry(
                &session_id,
                &g2,
                2,
                "request:exact-close",
                LocalLogEvent::close_history_group(),
            )?],
            LocalLogRecoveryLimits::new(1, 0, 0),
        )
        .err()
        .ok_or_else(|| test_error("compacted exact retry was accepted without its full proof"))?;
    let LocalLogRecoveryError::CompactedReplayId { checkpoint_sequence, .. } = error else {
        return Err(test_error("compacted exact retry used the wrong failure").into());
    };
    assert_eq!(checkpoint_sequence, LocalLogSequence::try_new(2)?);
    Ok(())
}

#[test]
fn empty_active_rotation_cannot_reset_or_hide_the_existing_lifetime_count() -> TestResult {
    let context = EditorContext::default();
    let session_id = LocalSessionId::try_new("session:empty-cap")?;
    let g0 = LocalLogId::try_new("log:empty-cap-g0")?;
    let g1 = LocalLogId::try_new("log:empty-cap-g1")?;
    let g2 = LocalLogId::try_new("log:empty-cap-g2")?;
    let recovered = recovered_two(&context, &session_id, &g0)?;
    let anchor = recovered.try_into_checkpoint_anchor(g1, LocalLogCompactionLimits::new(2))?;
    let continued = anchor.recover_successor(Vec::new(), LocalLogRecoveryLimits::new(0, 0, 0))?;

    let failure = continued
        .try_into_checkpoint_anchor_with_limits(g2.clone(), LocalLogCompactionLimits::new(1))
        .err()
        .ok_or_else(|| test_error("empty rotation reset the prior replay lifetime"))?;
    let LocalLogCompactionError::ReplayTombstoneLimit { compacted, active, attempted, maximum } =
        failure.error()
    else {
        return Err(test_error("empty rotation used the wrong error variant").into());
    };
    assert_eq!((*compacted, *active, *attempted, *maximum), (2, 0, 2, 1));
    let anchor = failure.into_owner().try_into_checkpoint_anchor(g2)?;
    assert_eq!(anchor.compacted_replay_count(), 2);
    Ok(())
}
