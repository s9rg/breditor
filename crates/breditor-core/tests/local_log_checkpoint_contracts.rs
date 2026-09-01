//! Black-box contracts for compact local-log checkpoints and their bound successor.

mod support;

use breditor_core::{
    codec::{DocumentJsonCodec, SessionCheckpointJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        ContinuedLocalLog, LocalLogCheckpointAnchor, LocalLogCompactionLimits, LocalLogEntry,
        LocalLogEvent, LocalLogEventKind, LocalLogId, LocalLogRecovery, LocalLogRecoveryLimits,
        LocalLogSequence, LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::{EditorSession, HistoryReplayError},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const PRIVATE_INITIAL_TEXT: &str = "PRIVATE_CHECKPOINT_DOCUMENT_TEXT";
const PRIVATE_SUCCESSOR_TEXT: &str = "PRIVATE_SUCCESSOR_DOCUMENT_TEXT";
const PRIVATE_LINEAGE: &str = "private-checkpoint-lineage";

struct CheckpointIdentity {
    session: LocalSessionId,
    checkpoint_log: LocalLogId,
    successor_log: LocalLogId,
    prefix_replay: ReplayId,
    successor_commit_replay: ReplayId,
    close_replay: ReplayId,
    undo_replay: ReplayId,
    redo_replay: ReplayId,
    clear_replay: ReplayId,
}

impl CheckpointIdentity {
    fn try_new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self {
            session: LocalSessionId::try_new("session:checkpoint-contract")?,
            checkpoint_log: LocalLogId::try_new("log:checkpoint-generation")?,
            successor_log: LocalLogId::try_new("log:successor-generation")?,
            prefix_replay: ReplayId::try_new("request:PRIVATE_PREFIX_REPLAY_ID")?,
            successor_commit_replay: ReplayId::try_new("request:successor-commit")?,
            close_replay: ReplayId::try_new("request:successor-close")?,
            undo_replay: ReplayId::try_new("request:successor-undo")?,
            redo_replay: ReplayId::try_new("request:successor-redo")?,
            clear_replay: ReplayId::try_new("request:successor-clear")?,
        })
    }
}

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

fn insert_transaction(
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

fn entry(
    session_id: &LocalSessionId,
    log_id: &LocalLogId,
    sequence: u64,
    replay_id: &ReplayId,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, Box<dyn std::error::Error>> {
    Ok(LocalLogEntry::new(
        session_id.clone(),
        log_id.clone(),
        LocalLogSequence::try_new(sequence)?,
        replay_id.clone(),
        event,
    ))
}

fn assert_anchor_contract(
    anchor: &LocalLogCheckpointAnchor,
    identity: &CheckpointIdentity,
    producer: &EditorSession,
    checkpoint_codec: &SessionCheckpointJsonCodec,
) -> TestResult {
    assert_eq!(anchor.session_id(), &identity.session);
    assert_eq!(anchor.checkpoint_log_id(), &identity.checkpoint_log);
    assert_eq!(anchor.successor_log_id(), &identity.successor_log);
    assert_eq!(anchor.checkpoint_covered_through(), Some(LocalLogSequence::FIRST));
    assert_eq!(anchor.next_sequence(), Some(LocalLogSequence::try_new(2)?));
    assert_eq!(anchor.compacted_replay_count(), 1);
    assert_eq!(
        anchor.compacted_sequence_for_replay_id(&identity.prefix_replay),
        Some(LocalLogSequence::FIRST)
    );
    assert_eq!(
        anchor.compacted_sequence_for_replay_id(&ReplayId::try_new("request:absent")?),
        None
    );
    assert_eq!((anchor.session().undo_depth(), anchor.session().redo_depth()), (1, 0));
    assert_eq!(checkpoint_codec.encode(anchor.session())?, checkpoint_codec.encode(producer)?);

    let debug = format!("{anchor:?}");
    assert!(debug.contains("LocalLogCheckpointAnchor"));
    assert!(debug.contains("compacted_replay_count: 1"));
    assert!(!debug.contains(PRIVATE_INITIAL_TEXT));
    assert!(!debug.contains(PRIVATE_LINEAGE));
    assert!(!debug.contains("PRIVATE_PREFIX_REPLAY_ID"));
    assert!(!debug.contains("TextSplice"));
    Ok(())
}

fn produce_successor_observations(
    producer: &mut EditorSession,
    identity: &CheckpointIdentity,
    merge_group: QualifiedName,
) -> Result<Vec<LocalLogEntry>, Box<dyn std::error::Error>> {
    // Reusing the still-open group makes undo and redo replay both operations
    // across the checkpoint boundary, rather than a new one-operation entry.
    let transaction = insert_transaction(
        producer.state(),
        1,
        PRIVATE_SUCCESSOR_TEXT,
        HistoryIntent::Merge { group: merge_group },
    )?;
    let commit = apply(producer, &transaction)?;
    assert_eq!((producer.undo_depth(), producer.redo_depth()), (1, 0));
    let mut observations = vec![entry(
        &identity.session,
        &identity.successor_log,
        2,
        &identity.successor_commit_replay,
        LocalLogEvent::commit(commit),
    )?];

    producer.close_history_group();
    for _ in 0..2 {
        observations.push(entry(
            &identity.session,
            &identity.successor_log,
            3,
            &identity.close_replay,
            LocalLogEvent::close_history_group(),
        )?);
    }

    let undo = history_commit(producer.undo())?;
    assert_eq!(undo.forward_operations().len(), 2);
    observations.push(entry(
        &identity.session,
        &identity.successor_log,
        4,
        &identity.undo_replay,
        LocalLogEvent::try_undo(undo)?,
    )?);

    let redo = history_commit(producer.redo())?;
    assert_eq!(redo.forward_operations().len(), 2);
    observations.push(entry(
        &identity.session,
        &identity.successor_log,
        5,
        &identity.redo_replay,
        LocalLogEvent::try_redo(redo)?,
    )?);

    producer.clear_history();
    observations.push(entry(
        &identity.session,
        &identity.successor_log,
        6,
        &identity.clear_replay,
        LocalLogEvent::clear_history(),
    )?);
    Ok(observations)
}

fn assert_continued_contract(
    continued: &ContinuedLocalLog,
    identity: &CheckpointIdentity,
    producer: &EditorSession,
    checkpoint_codec: &SessionCheckpointJsonCodec,
) -> TestResult {
    assert_eq!(continued.session_id(), &identity.session);
    assert_eq!(continued.checkpoint_log_id(), &identity.checkpoint_log);
    assert_eq!(continued.active_log_id(), &identity.successor_log);
    assert_eq!(continued.checkpoint_covered_through(), Some(LocalLogSequence::FIRST));
    assert_eq!(continued.covered_through(), Some(LocalLogSequence::try_new(6)?));
    assert_eq!(continued.next_sequence(), Some(LocalLogSequence::try_new(7)?));
    assert_eq!(continued.compacted_replay_count(), 1);
    assert_eq!(
        continued.compacted_sequence_for_replay_id(&identity.prefix_replay),
        Some(LocalLogSequence::FIRST)
    );
    assert_eq!(continued.observation_count(), 6);
    assert_eq!(continued.unique_event_count(), 5);
    assert_eq!(continued.exact_duplicate_count(), 1);
    assert_eq!(continued.applied_operation_count(), 5);
    assert_eq!((continued.session().undo_depth(), continued.session().redo_depth()), (0, 0));

    let expected_active = [
        (&identity.successor_commit_replay, LocalLogEventKind::Commit),
        (&identity.close_replay, LocalLogEventKind::CloseHistoryGroup),
        (&identity.undo_replay, LocalLogEventKind::Undo),
        (&identity.redo_replay, LocalLogEventKind::Redo),
        (&identity.clear_replay, LocalLogEventKind::ClearHistory),
    ];
    assert_eq!(continued.active_entries().len(), expected_active.len());
    for (index, (replay_id, kind)) in expected_active.into_iter().enumerate() {
        let retained = &continued.active_entries()[index];
        assert_eq!(retained.sequence().get(), u64::try_from(index)? + 2);
        assert_eq!(retained.replay_id(), replay_id);
        assert_eq!(retained.event_kind(), kind);
        let lookup = continued
            .active_entry_for_replay_id(replay_id)
            .ok_or_else(|| test_error(format!("missing active replay {replay_id}")))?;
        assert!(std::ptr::eq(lookup, retained));
    }
    assert_eq!(
        continued.active_entry_for_replay_id(&ReplayId::try_new("request:not-active")?),
        None
    );
    for (index, label) in [(2, "undo"), (3, "redo")] {
        let operation_count = continued.active_entries()[index]
            .event()
            .as_commit()
            .ok_or_else(|| test_error(format!("{label} event did not retain its commit")))?
            .forward_operations()
            .len();
        assert_eq!(operation_count, 2);
    }
    assert_eq!(continued.session().state(), producer.state());
    assert_eq!(checkpoint_codec.encode(continued.session())?, checkpoint_codec.encode(producer)?);

    let debug = format!("{continued:?}");
    assert!(debug.contains("ContinuedLocalLog"));
    assert!(debug.contains("exact_duplicate_count: 1"));
    assert!(!debug.contains(PRIVATE_INITIAL_TEXT));
    assert!(!debug.contains(PRIVATE_SUCCESSOR_TEXT));
    assert!(!debug.contains(PRIVATE_LINEAGE));
    assert!(!debug.contains("PRIVATE_PREFIX_REPLAY_ID"));
    assert!(!debug.contains("forward_operations"));
    assert!(!debug.contains("TextSplice"));
    Ok(())
}

#[test]
fn checkpoint_boundary_preserves_open_merge_history_and_all_event_kinds() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, PRIVATE_INITIAL_TEXT, PRIVATE_LINEAGE)?;
    let identity = CheckpointIdentity::try_new()?;
    let merge_group = QualifiedName::try_new("test/checkpoint-typing")?;
    let mut producer = EditorSession::new(initial.clone());

    let transaction = insert_transaction(
        producer.state(),
        0,
        "x",
        HistoryIntent::Merge { group: merge_group.clone() },
    )?;
    let commit = apply(&mut producer, &transaction)?;
    assert_eq!((producer.undo_depth(), producer.redo_depth()), (1, 0));
    let recovered =
        LocalLogRecovery::new(identity.session.clone(), identity.checkpoint_log.clone()).recover(
            EditorSession::new(initial),
            vec![entry(
                &identity.session,
                &identity.checkpoint_log,
                1,
                &identity.prefix_replay,
                LocalLogEvent::commit(commit),
            )?],
        )?;
    let anchor = recovered.try_into_checkpoint_anchor(
        identity.successor_log.clone(),
        LocalLogCompactionLimits::default(),
    )?;
    let codec = SessionCheckpointJsonCodec::new(context);
    assert_anchor_contract(&anchor, &identity, &producer, &codec)?;

    let observations = produce_successor_observations(&mut producer, &identity, merge_group)?;
    let continued = anchor.recover_successor(observations, LocalLogRecoveryLimits::default())?;
    assert_continued_contract(&continued, &identity, &producer, &codec)
}

#[test]
fn empty_prefix_and_empty_successor_preserve_the_first_frontier() -> TestResult {
    const PRIVATE_TEXT: &str = "PRIVATE_EMPTY_CHECKPOINT_TEXT";
    const PRIVATE_LINEAGE: &str = "private-empty-checkpoint-lineage";

    let context = EditorContext::default();
    let initial = state(&context, PRIVATE_TEXT, PRIVATE_LINEAGE)?;
    let session_id = LocalSessionId::try_new("session:empty-checkpoint")?;
    let checkpoint_log_id = LocalLogId::try_new("log:empty-checkpoint")?;
    let successor_log_id = LocalLogId::try_new("log:empty-successor")?;
    let absent_replay = ReplayId::try_new("request:absent-empty")?;

    let recovered = LocalLogRecovery::new(session_id.clone(), checkpoint_log_id.clone())
        .recover(EditorSession::new(initial.clone()), Vec::new())?;
    let anchor = recovered.try_into_checkpoint_anchor(
        successor_log_id.clone(),
        LocalLogCompactionLimits::default(),
    )?;

    assert_eq!(anchor.session_id(), &session_id);
    assert_eq!(anchor.checkpoint_log_id(), &checkpoint_log_id);
    assert_eq!(anchor.successor_log_id(), &successor_log_id);
    assert_eq!(anchor.session().state(), &initial);
    assert_eq!(anchor.checkpoint_covered_through(), None);
    assert_eq!(anchor.next_sequence(), Some(LocalLogSequence::FIRST));
    assert_eq!(anchor.compacted_replay_count(), 0);
    assert_eq!(anchor.compacted_sequence_for_replay_id(&absent_replay), None);

    let anchor_debug = format!("{anchor:?}");
    assert!(anchor_debug.contains("LocalLogCheckpointAnchor"));
    assert!(!anchor_debug.contains(PRIVATE_TEXT));
    assert!(!anchor_debug.contains(PRIVATE_LINEAGE));

    let continued = anchor.recover_successor(Vec::new(), LocalLogRecoveryLimits::default())?;
    assert_eq!(continued.session_id(), &session_id);
    assert_eq!(continued.checkpoint_log_id(), &checkpoint_log_id);
    assert_eq!(continued.active_log_id(), &successor_log_id);
    assert_eq!(continued.session().state(), &initial);
    assert_eq!(continued.checkpoint_covered_through(), None);
    assert_eq!(continued.covered_through(), None);
    assert_eq!(continued.next_sequence(), Some(LocalLogSequence::FIRST));
    assert_eq!(continued.compacted_replay_count(), 0);
    assert_eq!(continued.compacted_sequence_for_replay_id(&absent_replay), None);
    assert!(continued.active_entries().is_empty());
    assert_eq!(continued.active_entry_for_replay_id(&absent_replay), None);
    assert_eq!(continued.observation_count(), 0);
    assert_eq!(continued.unique_event_count(), 0);
    assert_eq!(continued.exact_duplicate_count(), 0);
    assert_eq!(continued.applied_operation_count(), 0);

    let continued_debug = format!("{continued:?}");
    assert!(continued_debug.contains("ContinuedLocalLog"));
    assert!(continued_debug.contains("observation_count: 0"));
    assert!(!continued_debug.contains(PRIVATE_TEXT));
    assert!(!continued_debug.contains(PRIVATE_LINEAGE));
    Ok(())
}
