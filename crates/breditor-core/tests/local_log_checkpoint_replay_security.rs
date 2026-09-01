//! Replay and authoritative-budget security laws across a compact checkpoint.

mod support;

use std::error::Error as StdError;

use breditor_core::{
    codec::DocumentJsonCodec,
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        LocalLogCheckpointAnchor, LocalLogCompactionLimits, LocalLogEntry, LocalLogEvent,
        LocalLogId, LocalLogRecovery, LocalLogRecoveryError, LocalLogRecoveryErrorCode,
        LocalLogRecoveryLimits, LocalLogSequence, LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const SESSION_ID: &str = "session:checkpoint-replay-security";
const CHECKPOINT_LOG_ID: &str = "log:checkpoint-replay-prefix";
const SUCCESSOR_LOG_ID: &str = "log:checkpoint-replay-successor";

fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
) -> Result<EditorState, Box<dyn StdError>> {
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
}

fn insert_transaction(
    state: &EditorState,
    text: &str,
    history: HistoryIntent,
) -> Result<Transaction, Box<dyn StdError>> {
    let start = TextOffset::try_new(0)?;
    let range = TextRange::try_new(path(&[0])?, start, start)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, history)))
}

fn apply_insert(
    session: &mut EditorSession,
    text: &str,
    history: HistoryIntent,
) -> Result<Commit, Box<dyn StdError>> {
    let transaction = insert_transaction(session.state(), text, history)?;
    session
        .apply_transaction(&transaction)?
        .into_commit()
        .ok_or_else(|| test_error("insertion unexpectedly remained unchanged").into())
}

fn commit_once(initial: &EditorState, text: &str) -> Result<Commit, Box<dyn StdError>> {
    apply_insert(&mut EditorSession::new(initial.clone()), text, HistoryIntent::Record)
}

fn entry(
    log_id: &str,
    sequence: u64,
    replay_id: &str,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, Box<dyn StdError>> {
    Ok(LocalLogEntry::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(log_id)?,
        LocalLogSequence::try_new(sequence)?,
        ReplayId::try_new(replay_id)?,
        event,
    ))
}

fn recovery() -> Result<LocalLogRecovery, Box<dyn StdError>> {
    Ok(LocalLogRecovery::new(
        LocalSessionId::try_new(SESSION_ID)?,
        LocalLogId::try_new(CHECKPOINT_LOG_ID)?,
    ))
}

fn anchor(
    initial: EditorState,
    prefix: Vec<LocalLogEntry>,
) -> Result<LocalLogCheckpointAnchor, Box<dyn StdError>> {
    Ok(recovery()?.recover(EditorSession::new(initial), prefix)?.try_into_checkpoint_anchor(
        LocalLogId::try_new(SUCCESSOR_LOG_ID)?,
        LocalLogCompactionLimits::default(),
    )?)
}

fn merged_history_anchor(
    initial: &EditorState,
) -> Result<(LocalLogCheckpointAnchor, Commit, EditorState), Box<dyn StdError>> {
    let group = QualifiedName::try_new("test/checkpoint-replay-merged")?;
    let mut producer = EditorSession::new(initial.clone());
    let first =
        apply_insert(&mut producer, "first-", HistoryIntent::Merge { group: group.clone() })?;
    let second = apply_insert(&mut producer, "second-", HistoryIntent::Merge { group })?;
    assert_eq!((producer.undo_depth(), producer.redo_depth()), (1, 0));
    let undo = producer
        .undo()?
        .ok_or_else(|| test_error("merged producer undo was unexpectedly unavailable"))?;
    assert_eq!(undo.forward_operations().len(), 2);
    let expected_after_undo = producer.state().clone();

    let prefix = vec![
        entry(CHECKPOINT_LOG_ID, 1, "replay:merged-first", LocalLogEvent::commit(first))?,
        entry(CHECKPOINT_LOG_ID, 2, "replay:merged-second", LocalLogEvent::commit(second))?,
    ];
    Ok((anchor(initial.clone(), prefix)?, undo, expected_after_undo))
}

fn one_operation_undo(initial: &EditorState) -> Result<Commit, Box<dyn StdError>> {
    let mut producer = EditorSession::new(initial.clone());
    apply_insert(&mut producer, "forged-short-", HistoryIntent::Record)?;
    let undo = producer
        .undo()?
        .ok_or_else(|| test_error("single-operation producer undo was unexpectedly unavailable"))?;
    assert_eq!(undo.forward_operations().len(), 1);
    Ok(undo)
}

#[test]
fn semantically_exact_compacted_retry_is_still_rejected_fail_closed() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "base", "exact-compacted-retry")?;
    let prefix_commit = commit_once(&initial, "prefix-")?;
    let exact_retry_commit = commit_once(&initial, "prefix-")?;
    assert_eq!(prefix_commit, exact_retry_commit);

    let checkpoint = anchor(
        initial,
        vec![entry(
            CHECKPOINT_LOG_ID,
            1,
            "replay:exact-compacted",
            LocalLogEvent::commit(prefix_commit),
        )?],
    )?;
    let error = checkpoint
        .recover_successor(
            vec![entry(
                SUCCESSOR_LOG_ID,
                1,
                "replay:exact-compacted",
                LocalLogEvent::commit(exact_retry_commit),
            )?],
            LocalLogRecoveryLimits::new(1, 1, 1),
        )
        .err()
        .ok_or_else(|| test_error("semantically exact compacted retry was accepted"))?;

    assert_eq!(error.code(), LocalLogRecoveryErrorCode::CompactedReplayId);
    assert_eq!(error.delivery_index(), Some(0));
    let LocalLogRecoveryError::CompactedReplayId { delivery_index, replay_id, checkpoint_sequence } =
        error
    else {
        return Err(test_error("exact compacted retry used the wrong error variant").into());
    };
    assert_eq!(delivery_index, 0);
    assert_eq!(replay_id.as_str(), "replay:exact-compacted");
    assert_eq!(checkpoint_sequence, LocalLogSequence::FIRST);
    Ok(())
}

#[test]
fn exact_successor_commit_retry_does_not_recharge_exact_resource_limits() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "base", "exact-successor-retry-limits")?;
    let first_commit = commit_once(&initial, "successor-")?;
    let retry_commit = commit_once(&initial, "successor-")?;
    assert_eq!(first_commit, retry_commit);

    let continued = anchor(initial, Vec::new())?.recover_successor(
        vec![
            entry(
                SUCCESSOR_LOG_ID,
                1,
                "replay:exact-successor",
                LocalLogEvent::commit(first_commit),
            )?,
            entry(
                SUCCESSOR_LOG_ID,
                1,
                "replay:exact-successor",
                LocalLogEvent::commit(retry_commit),
            )?,
        ],
        LocalLogRecoveryLimits::new(2, 1, 1),
    )?;

    assert_eq!(continued.observation_count(), 2);
    assert_eq!(continued.unique_event_count(), 1);
    assert_eq!(continued.exact_duplicate_count(), 1);
    assert_eq!(continued.applied_operation_count(), 1);
    assert_eq!(continued.active_entries().len(), 1);
    assert_eq!(continued.covered_through(), Some(LocalLogSequence::FIRST));
    assert_eq!(continued.next_sequence(), Some(LocalLogSequence::try_new(2)?));
    Ok(())
}

#[test]
fn checkpoint_history_is_authoritative_for_merged_undo_operation_budget() -> TestResult {
    let context = EditorContext::default();

    let exact_initial = state(&context, "base", "merged-undo-exact-budget")?;
    let (exact_anchor, exact_undo, expected_after_undo) = merged_history_anchor(&exact_initial)?;
    let exact = exact_anchor.recover_successor(
        vec![entry(
            SUCCESSOR_LOG_ID,
            3,
            "replay:merged-undo-exact",
            LocalLogEvent::try_undo(exact_undo)?,
        )?],
        LocalLogRecoveryLimits::new(1, 1, 2),
    )?;
    assert_eq!(exact.applied_operation_count(), 2);
    assert_eq!(exact.session().state(), &expected_after_undo);
    assert_eq!((exact.session().undo_depth(), exact.session().redo_depth()), (0, 1));

    let forged_initial = state(&context, "base", "merged-undo-forged-budget")?;
    let (forged_anchor, correct_undo, _) = merged_history_anchor(&forged_initial)?;
    assert_eq!(correct_undo.forward_operations().len(), 2);
    let forged_short_undo = one_operation_undo(&forged_initial)?;
    let error = forged_anchor
        .recover_successor(
            vec![entry(
                SUCCESSOR_LOG_ID,
                3,
                "replay:merged-undo-forged-short",
                LocalLogEvent::try_undo(forged_short_undo)?,
            )?],
            LocalLogRecoveryLimits::new(1, 1, 1),
        )
        .err()
        .ok_or_else(|| test_error("forged short undo bypassed the checkpoint history budget"))?;

    assert_eq!(error.code(), LocalLogRecoveryErrorCode::AppliedOperationLimit);
    assert_eq!(error.delivery_index(), Some(0));
    let LocalLogRecoveryError::AppliedOperationLimit { delivery_index, attempted, maximum } = error
    else {
        return Err(test_error("forged short undo used the wrong error variant").into());
    };
    assert_eq!((delivery_index, attempted, maximum), (0, 2, 1));
    Ok(())
}
