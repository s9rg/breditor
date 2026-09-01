//! Black-box contracts for complete, genesis-anchored local-log recovery.

mod support;

use breditor_core::{
    codec::{DocumentJsonCodec, SessionCheckpointJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogEventKind, LocalLogId, LocalLogRecovery,
        LocalLogSequence, LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::TextOffset,
    session::{EditorSession, HistoryReplayError},
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, Transaction, TransactionMetadata},
};
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

struct FullGenerationIdentity {
    session: LocalSessionId,
    log: LocalLogId,
    commit_replay: ReplayId,
    close_replay: ReplayId,
    undo_replay: ReplayId,
    redo_replay: ReplayId,
    clear_replay: ReplayId,
}

fn produce_full_generation(
    initial: &EditorState,
    identity: &FullGenerationIdentity,
    inserted_text: &str,
) -> Result<(EditorSession, Vec<LocalLogEntry>), Box<dyn std::error::Error>> {
    let mut producer = EditorSession::new(initial.clone());
    let edit = insert_transaction(
        producer.state(),
        1,
        inserted_text,
        HistoryIntent::Merge { group: QualifiedName::try_new("test/recovery-typing")? },
    )?;
    let edit_commit = apply(&mut producer, &edit)?;
    assert_eq!(producer.undo_depth(), 1);

    let mut observations = vec![entry(
        &identity.session,
        &identity.log,
        1,
        &identity.commit_replay,
        LocalLogEvent::commit(edit_commit),
    )?];

    producer.close_history_group();
    observations.push(entry(
        &identity.session,
        &identity.log,
        2,
        &identity.close_replay,
        LocalLogEvent::close_history_group(),
    )?);
    // This independently constructed physical retry is observed immediately
    // after the effective close. Recovery must recognize it before sequence
    // or effectiveness checks and must not attempt the close a second time.
    observations.push(entry(
        &identity.session,
        &identity.log,
        2,
        &identity.close_replay,
        LocalLogEvent::close_history_group(),
    )?);

    let undo = history_commit(producer.undo())?;
    observations.push(entry(
        &identity.session,
        &identity.log,
        3,
        &identity.undo_replay,
        LocalLogEvent::try_undo(undo)?,
    )?);

    let redo = history_commit(producer.redo())?;
    observations.push(entry(
        &identity.session,
        &identity.log,
        4,
        &identity.redo_replay,
        LocalLogEvent::try_redo(redo)?,
    )?);

    producer.clear_history();
    observations.push(entry(
        &identity.session,
        &identity.log,
        5,
        &identity.clear_replay,
        LocalLogEvent::clear_history(),
    )?);
    assert_eq!((producer.undo_depth(), producer.redo_depth()), (0, 0));
    Ok((producer, observations))
}

#[test]
fn empty_generation_preserves_genesis_and_reports_the_first_sequence() -> TestResult {
    const PRIVATE_TEXT: &str = "EMPTY_GENERATION_PRIVATE_TEXT";
    const PRIVATE_LINEAGE: &str = "empty-generation-private-lineage";

    let context = EditorContext::default();
    let initial = state(&context, PRIVATE_TEXT, PRIVATE_LINEAGE)?;
    let session_id = LocalSessionId::try_new("session:empty-generation")?;
    let log_id = LocalLogId::try_new("log:empty-generation")?;
    let recovered = LocalLogRecovery::new(session_id.clone(), log_id.clone())
        .recover(EditorSession::new(initial.clone()), Vec::new())?;

    assert_eq!(recovered.session_id(), &session_id);
    assert_eq!(recovered.active_log_id(), &log_id);
    assert_eq!(recovered.session().state(), &initial);
    assert!(recovered.entries().is_empty());
    assert_eq!(recovered.observation_count(), 0);
    assert_eq!(recovered.unique_event_count(), 0);
    assert_eq!(recovered.exact_duplicate_count(), 0);
    assert_eq!(recovered.applied_operation_count(), 0);
    assert_eq!(recovered.covered_through(), None);
    assert_eq!(recovered.next_sequence(), Some(LocalLogSequence::FIRST));
    assert_eq!(recovered.entry_for_replay_id(&ReplayId::try_new("request:absent")?), None);

    let debug = format!("{recovered:?}");
    assert!(debug.contains("RecoveredLocalLog"));
    assert!(debug.contains("observation_count: 0"));
    assert!(!debug.contains(PRIVATE_TEXT));
    assert!(!debug.contains(PRIVATE_LINEAGE));
    Ok(())
}

#[test]
fn full_generation_applies_every_event_once_and_retains_replay_proofs() -> TestResult {
    const PRIVATE_TEXT: &str = "RECOVERY_PAYLOAD_MUST_NOT_APPEAR_IN_DEBUG";
    const PRIVATE_LINEAGE: &str = "recovery-private-lineage";

    let context = EditorContext::default();
    let initial = state(&context, "a", PRIVATE_LINEAGE)?;
    let identity = FullGenerationIdentity {
        session: LocalSessionId::try_new("session:full-generation")?,
        log: LocalLogId::try_new("log:full-generation")?,
        commit_replay: ReplayId::try_new("request:commit")?,
        close_replay: ReplayId::try_new("request:close")?,
        undo_replay: ReplayId::try_new("request:undo")?,
        redo_replay: ReplayId::try_new("request:redo")?,
        clear_replay: ReplayId::try_new("request:clear")?,
    };
    let (producer, observations) = produce_full_generation(&initial, &identity, PRIVATE_TEXT)?;

    let recovered = LocalLogRecovery::new(identity.session.clone(), identity.log.clone())
        .recover(EditorSession::new(initial), observations)?;

    assert_eq!(recovered.session_id(), &identity.session);
    assert_eq!(recovered.active_log_id(), &identity.log);
    assert_eq!(recovered.observation_count(), 6);
    assert_eq!(recovered.unique_event_count(), 5);
    assert_eq!(recovered.exact_duplicate_count(), 1);
    assert_eq!(recovered.applied_operation_count(), 3);
    assert_eq!(recovered.covered_through(), Some(LocalLogSequence::try_new(5)?));
    assert_eq!(recovered.next_sequence(), Some(LocalLogSequence::try_new(6)?));

    let expected_replays = [
        (&identity.commit_replay, LocalLogEventKind::Commit),
        (&identity.close_replay, LocalLogEventKind::CloseHistoryGroup),
        (&identity.undo_replay, LocalLogEventKind::Undo),
        (&identity.redo_replay, LocalLogEventKind::Redo),
        (&identity.clear_replay, LocalLogEventKind::ClearHistory),
    ];
    assert_eq!(recovered.entries().len(), expected_replays.len());
    for (index, (replay_id, kind)) in expected_replays.into_iter().enumerate() {
        let retained = &recovered.entries()[index];
        assert_eq!(retained.sequence().get(), u64::try_from(index)? + 1);
        assert_eq!(retained.replay_id(), replay_id);
        assert_eq!(retained.event_kind(), kind);

        let lookup = recovered
            .entry_for_replay_id(replay_id)
            .ok_or_else(|| test_error(format!("missing retained replay {replay_id}")))?;
        assert!(std::ptr::eq(lookup, retained));
    }
    assert_eq!(recovered.entry_for_replay_id(&ReplayId::try_new("request:not-retained")?), None);

    assert_eq!(recovered.session().state(), producer.state());
    assert_eq!(recovered.session().history_capacity(), producer.history_capacity());
    assert_eq!(recovered.session().undo_depth(), producer.undo_depth());
    assert_eq!(recovered.session().redo_depth(), producer.redo_depth());
    let checkpoint_codec = SessionCheckpointJsonCodec::new(context);
    assert_eq!(checkpoint_codec.encode(recovered.session())?, checkpoint_codec.encode(&producer)?);

    let debug = format!("{recovered:?}");
    assert!(debug.contains("unique_event_count: 5"));
    assert!(debug.contains("exact_duplicate_count: 1"));
    assert!(!debug.contains(PRIVATE_TEXT));
    assert!(!debug.contains(PRIVATE_LINEAGE));
    assert!(!debug.contains("forward_operations"));
    assert!(!debug.contains("TextSplice"));
    Ok(())
}
