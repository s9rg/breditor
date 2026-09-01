//! Black-box round-trip contracts for individually identified local-log events.

mod support;

use breditor_core::{
    codec::{
        DocumentJsonCodec, LOCAL_LOG_ENTRY_FORMAT, LOCAL_LOG_ENTRY_FORMAT_VERSION,
        LocalLogEntryJsonCodec,
    },
    document::{Document, FormatSet, TextFragment, TextRun},
    local_log::{
        LocalLogEntry, LocalLogEvent, LocalLogEventKind, LocalLogId, LocalLogSequence,
        LocalLogSequenceError, LocalSessionId, ReplayId,
    },
    operation::{TextRange, TextSplice},
    position::{Affinity, Point, TextOffset},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{
        Commit, HistoryIntent, SelectionUpdate, Transaction, TransactionMetadata,
        TransactionOutcome,
    },
};
use serde_json::{Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const CANONICAL_CLOSE_HISTORY_GROUP: &str = r#"{"format":"breditor/local-log-entry","formatVersion":1,"sessionId":"session:stable-A","logId":"log:generation-B","sequence":"1","replayId":"request:close-1","event":{"kind":"closeHistoryGroup"}}"#;

fn document_codec(context: &EditorContext) -> DocumentJsonCodec {
    DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone())
}

fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
    selection: Option<Selection>,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = document_codec(context).decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, selection, None)
        .map_err(Into::into)
}

fn child_selection() -> Result<Selection, Box<dyn std::error::Error>> {
    let point =
        Point::Children { parent_path: path(&[0])?, child_index: 0, affinity: Affinity::Before };
    Ok(RangeSelection::new(point.clone(), point).into())
}

fn insert_transaction(
    state: &EditorState,
    offset: u64,
    text: &str,
) -> Result<Transaction, Box<dyn std::error::Error>> {
    let offset = TextOffset::try_new(offset)?;
    let range = TextRange::try_new(path(&[0])?, offset, offset)?;
    let replacement: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, replacement)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn state_only_transaction(state: &EditorState) -> Result<Transaction, Box<dyn std::error::Error>> {
    Ok(Transaction::new(state, Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(child_selection()?)))
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record)))
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn std::error::Error>> {
    outcome
        .into_commit()
        .ok_or_else(|| test_error("transaction unexpectedly remained unchanged").into())
}

fn apply(
    session: &mut EditorSession,
    transaction: &Transaction,
) -> Result<Commit, Box<dyn std::error::Error>> {
    committed(session.apply_transaction(transaction)?)
}

fn history_commit(
    result: Result<Option<Commit>, breditor_core::session::HistoryReplayError>,
) -> Result<Commit, Box<dyn std::error::Error>> {
    result?.ok_or_else(|| test_error("history replay was unexpectedly unavailable").into())
}

fn entry(
    sequence: u64,
    replay_id: &str,
    event: LocalLogEvent,
) -> Result<LocalLogEntry, Box<dyn std::error::Error>> {
    Ok(LocalLogEntry::new(
        LocalSessionId::try_new("session:stable-A")?,
        LocalLogId::try_new("log:generation-B")?,
        LocalLogSequence::try_new(sequence)?,
        ReplayId::try_new(replay_id)?,
        event,
    ))
}

fn round_trip(
    codec: &LocalLogEntryJsonCodec,
    entry: &LocalLogEntry,
) -> Result<(String, LocalLogEntry), Box<dyn std::error::Error>> {
    let encoded = codec.encode(entry)?;
    assert_eq!(codec.encode(entry)?, encoded, "encoding must be deterministic");
    let decoded = codec.decode(&encoded)?;
    assert_eq!(&decoded, entry, "decode(encode(entry)) must preserve the exact event");
    assert_eq!(codec.encode(&decoded)?, encoded, "canonical re-encoding must be byte-stable");
    Ok((encoded, decoded))
}

fn assert_single_text(document: &Document, expected: &str) -> TestResult {
    let text = document
        .node_at(&path(&[0, 0])?)?
        .as_text()
        .ok_or_else(|| test_error("expected one text leaf at [0, 0]"))?;
    assert_eq!(text.text(), expected);
    Ok(())
}

#[test]
fn minimal_close_history_group_has_exact_deterministic_v1_json() -> TestResult {
    assert_eq!(LOCAL_LOG_ENTRY_FORMAT, "breditor/local-log-entry");
    assert_eq!(LOCAL_LOG_ENTRY_FORMAT_VERSION, 1);

    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    assert_eq!(codec.context(), &context);
    let original = entry(1, "request:close-1", LocalLogEvent::close_history_group())?;

    let (encoded, decoded) = round_trip(&codec, &original)?;
    assert_eq!(encoded, CANONICAL_CLOSE_HISTORY_GROUP);
    assert_eq!(decoded.log_id().as_str(), "log:generation-B");
    assert_eq!(decoded.session_id().as_str(), "session:stable-A");
    assert_eq!(decoded.sequence(), LocalLogSequence::FIRST);
    assert_eq!(decoded.replay_id().as_str(), "request:close-1");
    assert_eq!(decoded.event_kind(), LocalLogEventKind::CloseHistoryGroup);
    assert_eq!(decoded.event().as_commit(), None);
    Ok(())
}

#[test]
fn clear_history_preserves_distinct_identity_scopes_and_maximum_sequence() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context);
    let original = entry(u64::MAX, "request:clear-max", LocalLogEvent::clear_history())?;

    let (encoded, decoded) = round_trip(&codec, &original)?;
    let record: Value = serde_json::from_str(&encoded)?;
    assert_eq!(record["sessionId"], json!("session:stable-A"));
    assert_eq!(record["logId"], json!("log:generation-B"));
    assert_eq!(record["sequence"], json!(u64::MAX.to_string()));
    assert_eq!(record["event"], json!({ "kind": "clearHistory" }));
    assert_eq!(decoded.sequence().get(), u64::MAX);
    assert_eq!(decoded.sequence().successor(), Err(LocalLogSequenceError::Overflow));
    assert_eq!(decoded.event_kind(), LocalLogEventKind::ClearHistory);
    assert_eq!(decoded.event().as_commit(), None);
    Ok(())
}

#[test]
fn ordinary_content_and_state_only_commits_are_both_valid_events() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());

    let mut content_session =
        EditorSession::new(state(&context, "a", "local-log-ordinary-content", None)?);
    let content_transaction = insert_transaction(content_session.state(), 1, "b")?;
    let content_commit = apply(&mut content_session, &content_transaction)?;
    let content_entry =
        entry(1, "request:ordinary-content", LocalLogEvent::commit(content_commit))?;
    assert_eq!(content_entry.event_kind(), LocalLogEventKind::Commit);
    assert_eq!(
        content_entry.event().as_commit().map(|commit| commit.forward_operations().len()),
        Some(1)
    );
    let (_, decoded_content) = round_trip(&codec, &content_entry)?;
    assert_single_text(
        decoded_content
            .event()
            .as_commit()
            .ok_or_else(|| test_error("decoded content event lost its commit"))?
            .after()
            .document(),
        "ab",
    )?;

    let mut state_only_session =
        EditorSession::new(state(&context, "", "local-log-ordinary-state-only", None)?);
    let state_only = state_only_transaction(state_only_session.state())?;
    let state_only_commit = apply(&mut state_only_session, &state_only)?;
    assert!(state_only_commit.forward_operations().is_empty());
    let state_only_entry =
        entry(2, "request:ordinary-state-only", LocalLogEvent::commit(state_only_commit))?;
    let (_, decoded_state_only) = round_trip(&codec, &state_only_entry)?;
    let decoded_commit = decoded_state_only
        .event()
        .as_commit()
        .ok_or_else(|| test_error("decoded state-only event lost its commit"))?;
    assert!(decoded_commit.forward_operations().is_empty());
    assert_eq!(decoded_commit.after().selection(), Some(&child_selection()?));
    Ok(())
}

#[test]
fn real_session_undo_and_redo_commits_use_checked_event_constructors() -> TestResult {
    let context = EditorContext::default();
    let codec = LocalLogEntryJsonCodec::new(context.clone());
    let mut session =
        EditorSession::new(state(&context, "a", "local-log-real-history-replay", None)?);
    let transaction = insert_transaction(session.state(), 1, "b")?;
    apply(&mut session, &transaction)?;

    let undo = history_commit(session.undo())?;
    let redo = history_commit(session.redo())?;
    let undo_entry = entry(2, "request:undo-2", LocalLogEvent::try_undo(undo)?)?;
    let redo_entry = entry(3, "request:redo-3", LocalLogEvent::try_redo(redo)?)?;

    for (original, expected_kind, expected_action) in [
        (undo_entry, LocalLogEventKind::Undo, "breditor/undo"),
        (redo_entry, LocalLogEventKind::Redo, "breditor/redo"),
    ] {
        assert_eq!(original.event_kind(), expected_kind);
        let commit = original
            .event()
            .as_commit()
            .ok_or_else(|| test_error("checked replay event lost its commit"))?;
        assert!(!commit.forward_operations().is_empty());
        assert_eq!(
            commit.metadata().action().map(breditor_core::identity::QualifiedName::as_str),
            Some(expected_action)
        );
        assert_eq!(commit.metadata().history(), &HistoryIntent::Ignore);

        let (_, decoded) = round_trip(&codec, &original)?;
        assert_eq!(decoded.event_kind(), expected_kind);
        assert_eq!(decoded.event().as_commit(), original.event().as_commit());
    }
    Ok(())
}

#[test]
fn event_getters_expose_the_commit_while_debug_output_redacts_its_payload() -> TestResult {
    const SECRET: &str = "DO_NOT_DEBUG_PAYLOAD";

    let context = EditorContext::default();
    let mut session =
        EditorSession::new(state(&context, "", "local-log-debug-secret-lineage", None)?);
    let transaction = insert_transaction(session.state(), 0, SECRET)?;
    let commit = apply(&mut session, &transaction)?;
    let original = entry(1, "request:debug-redaction", LocalLogEvent::commit(commit))?;

    let retained = original
        .event()
        .as_commit()
        .ok_or_else(|| test_error("commit getter unexpectedly returned none"))?;
    assert_single_text(retained.after().document(), SECRET)?;
    assert_eq!(original.event().kind(), LocalLogEventKind::Commit);
    assert_eq!(original.event_kind(), LocalLogEventKind::Commit);

    let event_debug = format!("{:?}", original.event());
    let entry_debug = format!("{original:?}");
    assert_eq!(event_debug, "LocalLogEvent { kind: Commit, .. }");
    assert!(entry_debug.contains("event_kind: Commit"));
    for debug in [&event_debug, &entry_debug] {
        assert!(!debug.contains(SECRET));
        assert!(!debug.contains("local-log-debug-secret-lineage"));
        assert!(!debug.contains("forward_operations"));
    }
    Ok(())
}
