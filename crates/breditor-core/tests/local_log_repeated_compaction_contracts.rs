//! Black-box contracts for cumulative local-log checkpoint rotation.

mod support;

use breditor_core::{
    codec::{
        DocumentJsonCodec, LOCAL_LOG_CHECKPOINT_FORMAT, LOCAL_LOG_CHECKPOINT_FORMAT_VERSION,
        LocalLogCheckpointJsonCodec, LocalLogCheckpointLimits, SessionCheckpointJsonCodec,
    },
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        LocalLogCheckpointBinding, LocalLogCompactionLimits, LocalLogEntry, LocalLogEvent,
        LocalLogId, LocalLogRecovery, LocalLogRecoveryLimits, LocalLogSequence, LocalSessionId,
        ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::{EditorSession, HistoryReplayError},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};
use serde_json::Value;
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, None, None)
        .map_err(Into::into)
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

fn insertion(
    state: &EditorState,
    offset: u64,
    text: &str,
    history: HistoryIntent,
) -> Result<Transaction, Box<dyn std::error::Error>> {
    let offset = TextOffset::try_new(offset)?;
    let range = TextRange::try_new(path(&[0])?, offset, offset)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, history)))
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

fn history_commit(
    result: Result<Option<Commit>, HistoryReplayError>,
) -> Result<Commit, Box<dyn std::error::Error>> {
    result?.ok_or_else(|| test_error("history replay was unexpectedly unavailable").into())
}

#[test]
fn repeated_rotation_merges_exact_replays_and_stays_checkpoint_v1() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "", "repeated-contract")?;
    let mut producer = EditorSession::new(initial.clone());
    let session_id = LocalSessionId::try_new("session:repeated-contract")?;
    let g0 = LocalLogId::try_new("log:g0")?;
    let g1 = LocalLogId::try_new("log:g1")?;
    let g2 = LocalLogId::try_new("log:g2")?;

    let first = insertion(producer.state(), 0, "a", HistoryIntent::Record)?;
    let first_commit = apply(&mut producer, &first)?;
    let second = insertion(producer.state(), 1, "b", HistoryIntent::Record)?;
    let second_commit = apply(&mut producer, &second)?;

    // Replay IDs are deliberately not lexical in sequence order.
    let recovered = LocalLogRecovery::new(session_id.clone(), g0.clone()).recover(
        EditorSession::new(initial),
        vec![
            entry(&session_id, &g0, 1, "request:z-first", LocalLogEvent::commit(first_commit))?,
            entry(&session_id, &g0, 2, "request:a-second", LocalLogEvent::commit(second_commit))?,
        ],
    )?;
    let anchor =
        recovered.try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(4))?;
    assert_eq!(anchor.compaction_limits().max_replay_tombstones(), 4);

    let third_before = producer.state().clone();
    let third = insertion(&third_before, 2, "c", HistoryIntent::Record)?;
    let exact_retry_commit = third
        .apply(&context, &third_before)?
        .into_commit()
        .ok_or_else(|| test_error("retry transaction unexpectedly remained unchanged"))?;
    let third_commit = apply(&mut producer, &third)?;
    let fourth = insertion(producer.state(), 3, "d", HistoryIntent::Record)?;
    let fourth_commit = apply(&mut producer, &fourth)?;
    let first_g1 =
        entry(&session_id, &g1, 3, "request:m-third", LocalLogEvent::commit(third_commit))?;
    let exact_g1_retry =
        entry(&session_id, &g1, 3, "request:m-third", LocalLogEvent::commit(exact_retry_commit))?;
    let continued = anchor.recover_successor(
        vec![
            first_g1,
            exact_g1_retry,
            entry(&session_id, &g1, 4, "request:b-fourth", LocalLogEvent::commit(fourth_commit))?,
        ],
        LocalLogRecoveryLimits::default(),
    )?;
    assert_eq!(continued.observation_count(), 3);
    assert_eq!(continued.unique_event_count(), 2);
    assert_eq!(continued.exact_duplicate_count(), 1);
    assert_eq!(continued.represented_replay_count(), 4);

    let anchor = continued.try_into_checkpoint_anchor(g2.clone())?;
    assert_eq!(anchor.checkpoint_log_id(), &g1);
    assert_eq!(anchor.successor_log_id(), &g2);
    assert_eq!(anchor.checkpoint_covered_through(), Some(LocalLogSequence::try_new(4)?));
    assert_eq!(anchor.next_sequence(), Some(LocalLogSequence::try_new(5)?));
    assert_eq!(anchor.compacted_replay_count(), 4);
    for (replay_id, sequence) in [
        ("request:z-first", 1),
        ("request:a-second", 2),
        ("request:m-third", 3),
        ("request:b-fourth", 4),
    ] {
        assert_eq!(
            anchor.compacted_sequence_for_replay_id(&ReplayId::try_new(replay_id)?),
            Some(LocalLogSequence::try_new(sequence)?)
        );
    }

    let binding = LocalLogCheckpointBinding::try_new(session_id, g1, g2)?;
    let codec = LocalLogCheckpointJsonCodec::new(context, binding)
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(7));
    let json = codec.encode(&anchor)?;
    let value: Value = serde_json::from_str(&json)?;
    assert_eq!(value["format"], LOCAL_LOG_CHECKPOINT_FORMAT);
    assert_eq!(value["formatVersion"], LOCAL_LOG_CHECKPOINT_FORMAT_VERSION);
    assert_eq!(
        value["replayTombstones"],
        serde_json::json!([
            "request:z-first",
            "request:a-second",
            "request:m-third",
            "request:b-fourth"
        ])
    );
    let decoded = codec.decode(&json)?;
    // The policy is intentionally not a ninth wire field: decode installs the
    // current trusted host policy rather than recovering the runtime value 4.
    assert_eq!(decoded.compaction_limits().max_replay_tombstones(), 7);
    assert_eq!(codec.encode(&decoded)?, json);
    Ok(())
}

#[test]
fn empty_active_generation_rotates_without_resetting_the_frontier() -> TestResult {
    let context = EditorContext::default();
    let session_id = LocalSessionId::try_new("session:empty-rotation")?;
    let g0 = LocalLogId::try_new("log:empty-g0")?;
    let g1 = LocalLogId::try_new("log:empty-g1")?;
    let g2 = LocalLogId::try_new("log:empty-g2")?;

    let recovered = LocalLogRecovery::new(session_id.clone(), g0)
        .recover(EditorSession::new(state(&context, "", "empty-rotation")?), Vec::new())?;
    let anchor =
        recovered.try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(0))?;
    let continued = anchor.recover_successor(Vec::new(), LocalLogRecoveryLimits::new(0, 0, 0))?;
    assert_eq!(continued.represented_replay_count(), 0);
    let anchor = continued.try_into_checkpoint_anchor(g2.clone())?;

    assert_eq!(anchor.checkpoint_log_id(), &g1);
    assert_eq!(anchor.successor_log_id(), &g2);
    assert_eq!(anchor.checkpoint_covered_through(), None);
    assert_eq!(anchor.next_sequence(), Some(LocalLogSequence::FIRST));
    assert_eq!(anchor.compacted_replay_count(), 0);
    assert_eq!(anchor.compaction_limits(), LocalLogCompactionLimits::new(0));
    assert_eq!((anchor.session().undo_depth(), anchor.session().redo_depth()), (0, 0));
    Ok(())
}

#[test]
fn merged_undo_and_redo_history_survives_two_compactions_and_decode() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "x", "repeated-history")?;
    let mut producer = EditorSession::new(initial.clone());
    let session_id = LocalSessionId::try_new("session:repeated-history")?;
    let g0 = LocalLogId::try_new("log:history-g0")?;
    let g1 = LocalLogId::try_new("log:history-g1")?;
    let g2 = LocalLogId::try_new("log:history-g2")?;
    let g3 = LocalLogId::try_new("log:history-g3")?;
    let group = QualifiedName::try_new("breditor/repeated-history")?;

    let first = insertion(producer.state(), 1, "A", HistoryIntent::Merge { group: group.clone() })?;
    let first_commit = apply(&mut producer, &first)?;
    let recovered = LocalLogRecovery::new(session_id.clone(), g0.clone()).recover(
        EditorSession::new(initial),
        vec![entry(
            &session_id,
            &g0,
            1,
            "request:history-first",
            LocalLogEvent::commit(first_commit),
        )?],
    )?;
    let anchor =
        recovered.try_into_checkpoint_anchor(g1.clone(), LocalLogCompactionLimits::new(4))?;

    let second = insertion(producer.state(), 2, "B", HistoryIntent::Merge { group })?;
    let second_commit = apply(&mut producer, &second)?;
    assert_eq!((producer.undo_depth(), producer.redo_depth()), (1, 0));
    let continued = anchor.recover_successor(
        vec![entry(
            &session_id,
            &g1,
            2,
            "request:history-second",
            LocalLogEvent::commit(second_commit),
        )?],
        LocalLogRecoveryLimits::default(),
    )?;
    let anchor = continued.try_into_checkpoint_anchor(g2.clone())?;

    let undo = history_commit(producer.undo())?;
    assert_eq!(undo.forward_operations().len(), 2);
    let continued = anchor.recover_successor(
        vec![entry(&session_id, &g2, 3, "request:history-undo", LocalLogEvent::try_undo(undo)?)?],
        LocalLogRecoveryLimits::new(1, 1, 2),
    )?;
    assert_eq!((continued.session().undo_depth(), continued.session().redo_depth()), (0, 1));
    let anchor = continued.try_into_checkpoint_anchor(g3.clone())?;

    let binding = LocalLogCheckpointBinding::try_new(session_id.clone(), g2, g3.clone())?;
    let codec = LocalLogCheckpointJsonCodec::new(context.clone(), binding)
        .with_limits(LocalLogCheckpointLimits::default().with_max_replay_tombstones(4));
    let decoded = codec.decode(&codec.encode(&anchor)?)?;

    let redo = history_commit(producer.redo())?;
    assert_eq!(redo.forward_operations().len(), 2);
    let continued = decoded.recover_successor(
        vec![entry(&session_id, &g3, 4, "request:history-redo", LocalLogEvent::try_redo(redo)?)?],
        LocalLogRecoveryLimits::new(1, 1, 2),
    )?;
    let session_codec = SessionCheckpointJsonCodec::new(context);
    assert_eq!(session_codec.encode(continued.session())?, session_codec.encode(&producer)?);
    assert_eq!((continued.session().undo_depth(), continued.session().redo_depth()), (1, 0));
    Ok(())
}
