//! Black-box round-trip contracts for durable session/history checkpoints.

mod support;

use std::error::Error;

use breditor_core::{
    codec::{
        DocumentJsonCodec, EditorStateJsonCodec, SESSION_CHECKPOINT_FORMAT,
        SESSION_CHECKPOINT_FORMAT_VERSION, SessionCheckpointJsonCodec,
    },
    document::{Document, FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        Operation, ParagraphJoin, ParagraphSplit, RootTextBoundary, RootTextRange, RootTextReplace,
        TextRange, TextSplice,
    },
    position::{Affinity, Point, TextOffset},
    selection::{RangeSelection, Selection},
    session::{EditorSession, HistoryCapacity, HistoryReplayError},
    state::{EditorContext, EditorState, LineageId, Revision, RevisionError},
    transaction::{
        Commit, HistoryIntent, PendingFormatsUpdate, ReplayDirection, SelectionUpdate, Transaction,
        TransactionApplyError, TransactionMetadata,
    },
};
use serde_json::{Value, json};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

const CANONICAL_MINIMAL_SESSION_CHECKPOINT: &str = concat!(
    r#"{"format":"breditor/session-checkpoint","formatVersion":1,"historyBase":{"format":"breditor/editor-state","formatVersion":1,"snapshot":{"lineage":"session-checkpoint-canonical","revision":"0"},"document":{"format":"breditor/document","formatVersion":1,"schema":{"name":"breditor/base","version":1},"root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},"children":["#,
    r#"{"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{},"children":[]}"#,
    r#"]}},"selection":null,"pendingFormats":null},"currentRevision":"0","historyCapacity":100,"cursor":0,"entries":[],"openMergeGroup":null}"#,
);

fn document_codec(context: &EditorContext) -> DocumentJsonCodec {
    DocumentJsonCodec::new(context.schema().clone()).with_limits(context.limits().clone())
}

fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = document_codec(context).decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn state_at_revision(
    context: &EditorContext,
    text: &str,
    lineage: &str,
    revision: u64,
) -> Result<EditorState, Box<dyn Error>> {
    let initial = state(context, text, lineage, None, None)?;
    let state_codec = EditorStateJsonCodec::new(context.clone());
    let mut record: Value = serde_json::from_str(&state_codec.encode(&initial)?)?;
    record["snapshot"]["revision"] = json!(revision.to_string());
    state_codec.decode(&serde_json::to_string(&record)?).map_err(Into::into)
}

fn selection(
    offset: u32,
    anchor_affinity: Affinity,
    focus_affinity: Affinity,
) -> Result<Selection, Box<dyn Error>> {
    let text_path = path(&[0, 0])?;
    Ok(RangeSelection::new(
        Point::Text {
            text_path: text_path.clone(),
            utf16_offset: offset,
            affinity: anchor_affinity,
        },
        Point::Text { text_path, utf16_offset: offset, affinity: focus_affinity },
    )
    .into())
}

fn fragment(text: &str) -> Result<TextFragment, Box<dyn Error>> {
    if text.is_empty() {
        Ok(TextFragment::empty())
    } else {
        Ok(TextRun::try_new(text, FormatSet::default())?.into())
    }
}

fn insert_transaction(
    state: &EditorState,
    offset: u64,
    text: &str,
    history: HistoryIntent,
    result_selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<Transaction, Box<dyn Error>> {
    let offset = TextOffset::try_new(offset)?;
    let range = TextRange::try_new(path(&[0])?, offset, offset)?;
    let splice = TextSplice::capture(state.context(), state.document(), range, fragment(text)?)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_selection_update(SelectionUpdate::Set(result_selection))
        .with_pending_formats_update(PendingFormatsUpdate::Set(pending_formats))
        .with_metadata(TransactionMetadata::new(None, history)))
}

fn state_only_transaction(
    state: &EditorState,
    result_selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Transaction {
    Transaction::new(state, Vec::new())
        .with_selection_update(SelectionUpdate::Set(result_selection))
        .with_pending_formats_update(PendingFormatsUpdate::Set(pending_formats))
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record))
}

fn apply(session: &mut EditorSession, transaction: &Transaction) -> Result<Commit, Box<dyn Error>> {
    session
        .apply_transaction(transaction)?
        .into_commit()
        .ok_or_else(|| test_error("transaction unexpectedly remained unchanged").into())
}

fn apply_recorded_operation(
    session: &mut EditorSession,
    operation: Operation,
) -> Result<Commit, Box<dyn Error>> {
    let transaction = Transaction::new(session.state(), vec![operation])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    apply(session, &transaction)
}

fn history_commit(
    result: Result<Option<Commit>, HistoryReplayError>,
) -> Result<Commit, Box<dyn Error>> {
    result?.ok_or_else(|| test_error("history unexpectedly unavailable").into())
}

fn assert_sessions_equal(left: &EditorSession, right: &EditorSession) {
    assert_eq!(left.state(), right.state());
    assert_eq!(left.history_capacity(), right.history_capacity());
    assert_eq!(left.undo_depth(), right.undo_depth());
    assert_eq!(left.redo_depth(), right.redo_depth());
    assert_eq!(left.can_undo(), right.can_undo());
    assert_eq!(left.can_redo(), right.can_redo());
}

fn assert_history_lockstep(left: &mut EditorSession, right: &mut EditorSession) -> TestResult {
    loop {
        let left_commit = left.undo()?;
        let right_commit = right.undo()?;
        assert_eq!(left_commit, right_commit);
        assert_sessions_equal(left, right);
        if left_commit.is_none() {
            break;
        }
    }
    loop {
        let left_commit = left.redo()?;
        let right_commit = right.redo()?;
        assert_eq!(left_commit, right_commit);
        assert_sessions_equal(left, right);
        if left_commit.is_none() {
            break;
        }
    }
    Ok(())
}

fn assert_single_text(document: &Document, expected: &str) -> TestResult {
    let Some(paragraph) = document.node_at(&path(&[0])?)?.as_element() else {
        return Err(test_error("paragraph path did not resolve to an element").into());
    };
    let Some(text) = paragraph.children().get(0).and_then(|child| child.as_text()) else {
        return Err(test_error("paragraph did not contain one text leaf").into());
    };
    assert_eq!(paragraph.children().len(), 1);
    assert_eq!(text.text(), expected);
    Ok(())
}

fn round_trip(
    codec: &SessionCheckpointJsonCodec,
    session: &EditorSession,
) -> Result<(String, EditorSession), Box<dyn Error>> {
    let encoded = codec.encode(session)?;
    assert_eq!(codec.encode(session)?, encoded);
    let restored = codec.decode(&encoded)?;
    assert_sessions_equal(session, &restored);
    assert_eq!(codec.encode(&restored)?, encoded);
    Ok((encoded, restored))
}

#[test]
fn minimal_session_checkpoint_has_exact_deterministic_v1_json() -> TestResult {
    assert_eq!(SESSION_CHECKPOINT_FORMAT, "breditor/session-checkpoint");
    assert_eq!(SESSION_CHECKPOINT_FORMAT_VERSION, 1);

    let context = EditorContext::default();
    let initial = state(&context, "", "session-checkpoint-canonical", None, None)?;
    let session = EditorSession::new(initial);
    let codec = SessionCheckpointJsonCodec::new(context);
    let (encoded, restored) = round_trip(&codec, &session)?;

    assert_eq!(encoded, CANONICAL_MINIMAL_SESSION_CHECKPOINT);
    assert_sessions_equal(&session, &restored);
    Ok(())
}

#[test]
fn current_revision_is_restored_separately_from_the_revision_zero_history_base() -> TestResult {
    let context = EditorContext::default();
    let initial = state_at_revision(&context, "a", "session-checkpoint-revision", 42)?;
    let session = EditorSession::new(initial);
    let codec = SessionCheckpointJsonCodec::new(context);
    let (encoded, restored) = round_trip(&codec, &session)?;
    let record: Value = serde_json::from_str(&encoded)?;

    assert_eq!(record["historyBase"]["snapshot"]["revision"], "0");
    assert_eq!(record["currentRevision"], "42");
    assert_eq!(restored.state().snapshot().revision(), Revision::new(42));
    Ok(())
}

#[test]
fn chronological_entries_and_mid_cursor_restore_all_history_in_lockstep() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "session-checkpoint-mid-cursor", None, None)?;
    let mut original = EditorSession::new(initial);
    for (offset, text) in [(1, "b"), (2, "c"), (3, "d")] {
        let transaction =
            insert_transaction(original.state(), offset, text, HistoryIntent::Record, None, None)?;
        apply(&mut original, &transaction)?;
    }
    history_commit(original.undo())?;
    history_commit(original.undo())?;
    assert_eq!((original.undo_depth(), original.redo_depth()), (1, 2));
    assert_single_text(original.state().document(), "ab")?;

    let codec = SessionCheckpointJsonCodec::new(context);
    let (encoded, mut restored) = round_trip(&codec, &original)?;
    let record: Value = serde_json::from_str(&encoded)?;
    assert_eq!(record["cursor"], 1);
    assert_eq!(record["entries"].as_array().map(Vec::len), Some(3));

    assert_history_lockstep(&mut original, &mut restored)?;
    assert_single_text(original.state().document(), "abcd")?;
    Ok(())
}

#[test]
fn an_open_merge_group_continues_after_restore() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "session-checkpoint-open-merge", None, None)?;
    let mut original = EditorSession::new(initial.clone());
    let group = QualifiedName::try_new("test/session-checkpoint-typing")?;
    let first = insert_transaction(
        original.state(),
        1,
        "b",
        HistoryIntent::Merge { group: group.clone() },
        None,
        None,
    )?;
    apply(&mut original, &first)?;

    let codec = SessionCheckpointJsonCodec::new(context);
    let (encoded, mut restored) = round_trip(&codec, &original)?;
    let record: Value = serde_json::from_str(&encoded)?;
    assert_eq!(record["openMergeGroup"], group.as_str());

    let continuation =
        insert_transaction(original.state(), 2, "c", HistoryIntent::Merge { group }, None, None)?;
    let original_commit = apply(&mut original, &continuation)?;
    let restored_commit = apply(&mut restored, &continuation)?;
    assert_eq!(original_commit, restored_commit);
    assert_sessions_equal(&original, &restored);
    assert_eq!(original.undo_depth(), 1, "the restored open group must merge in place");

    let original_undo = history_commit(original.undo())?;
    let restored_undo = history_commit(restored.undo())?;
    assert_eq!(original_undo, restored_undo);
    assert_eq!(original.state().document(), initial.document());
    assert_eq!(restored.state(), original.state());
    Ok(())
}

#[test]
fn a_state_only_commit_survives_as_the_shared_mid_cursor_boundary() -> TestResult {
    let context = EditorContext::default();
    let initial_selection = selection(1, Affinity::Before, Affinity::After)?;
    let initial = state(
        &context,
        "a",
        "session-checkpoint-state-only",
        Some(initial_selection.clone()),
        None,
    )?;
    let mut original = EditorSession::new(initial);
    for (offset, text) in [(1, "b"), (2, "c"), (3, "d")] {
        let result_selection =
            selection(u32::try_from(offset + 1)?, Affinity::Before, Affinity::After)?;
        let transaction = insert_transaction(
            original.state(),
            offset,
            text,
            HistoryIntent::Record,
            Some(result_selection),
            None,
        )?;
        apply(&mut original, &transaction)?;
    }
    history_commit(original.undo())?;
    history_commit(original.undo())?;

    let middle_selection = selection(0, Affinity::After, Affinity::Before)?;
    let middle_formats = FormatSet::default();
    let state_only = state_only_transaction(
        original.state(),
        Some(middle_selection.clone()),
        Some(middle_formats.clone()),
    );
    let state_only_commit = apply(&mut original, &state_only)?;
    assert!(state_only_commit.forward_operations().is_empty());
    assert_eq!((original.undo_depth(), original.redo_depth()), (1, 2));

    let codec = SessionCheckpointJsonCodec::new(context);
    let (_, mut restored) = round_trip(&codec, &original)?;

    let original_undo = history_commit(original.undo())?;
    let restored_undo = history_commit(restored.undo())?;
    assert_eq!(original_undo, restored_undo);
    assert_eq!(original.state().selection(), Some(&initial_selection));

    let original_redo = history_commit(original.redo())?;
    let restored_redo = history_commit(restored.redo())?;
    assert_eq!(original_redo, restored_redo);
    assert_eq!(original.state().selection(), Some(&middle_selection));
    assert_eq!(original.state().pending_formats(), Some(&middle_formats));

    history_commit(original.redo())?;
    history_commit(restored.redo())?;
    history_commit(original.undo())?;
    history_commit(restored.undo())?;
    assert_sessions_equal(&original, &restored);
    assert_eq!(original.state().selection(), Some(&middle_selection));
    assert_eq!(original.state().pending_formats(), Some(&middle_formats));
    Ok(())
}

#[test]
fn capacity_eviction_advances_history_base_without_resurrecting_old_entries() -> TestResult {
    let context = EditorContext::default();
    let capacity = HistoryCapacity::try_new(3)?;
    let initial = state(&context, "a", "session-checkpoint-capacity", None, None)?;
    let mut original = EditorSession::with_history_capacity(initial, capacity);
    for (offset, text) in [(1, "b"), (2, "c"), (3, "d"), (4, "e")] {
        let transaction =
            insert_transaction(original.state(), offset, text, HistoryIntent::Record, None, None)?;
        apply(&mut original, &transaction)?;
    }
    assert_eq!(original.undo_depth(), 3);

    let codec = SessionCheckpointJsonCodec::new(context.clone());
    let (encoded, mut restored) = round_trip(&codec, &original)?;
    let record: Value = serde_json::from_str(&encoded)?;
    assert_eq!(record["entries"].as_array().map(Vec::len), Some(3));
    assert_eq!(record["cursor"], 3);
    let history_base = EditorStateJsonCodec::new(context)
        .decode(&serde_json::to_string(&record["historyBase"])?)?;
    assert_single_text(history_base.document(), "ab")?;

    for _ in 0..3 {
        let original_commit = history_commit(original.undo())?;
        let restored_commit = history_commit(restored.undo())?;
        assert_eq!(original_commit, restored_commit);
    }
    assert!(original.undo()?.is_none());
    assert!(restored.undo()?.is_none());
    assert_sessions_equal(&original, &restored);
    assert_single_text(original.state().document(), "ab")?;

    while original.can_redo() {
        let original_commit = history_commit(original.redo())?;
        let restored_commit = history_commit(restored.redo())?;
        assert_eq!(original_commit, restored_commit);
    }
    assert_sessions_equal(&original, &restored);
    assert_single_text(original.state().document(), "abcde")?;
    Ok(())
}

#[test]
fn maximum_current_revision_restores_and_failed_replay_is_atomic() -> TestResult {
    let context = EditorContext::default();
    let initial =
        state_at_revision(&context, "a", "session-checkpoint-max-revision-redo", u64::MAX - 2)?;
    let mut session = EditorSession::new(initial);
    let edit = insert_transaction(session.state(), 1, "b", HistoryIntent::Record, None, None)?;
    apply(&mut session, &edit)?;
    history_commit(session.undo())?;
    assert_eq!(session.state().snapshot().revision(), Revision::new(u64::MAX));
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let codec = SessionCheckpointJsonCodec::new(context);
    let (encoded, mut restored) = round_trip(&codec, &session)?;
    let record: Value = serde_json::from_str(&encoded)?;
    assert_eq!(record["historyBase"]["snapshot"]["revision"], "0");
    assert_eq!(record["currentRevision"], u64::MAX.to_string());

    let state_before = restored.state().clone();
    let status_before = restored.history_status();
    assert_eq!(
        restored.redo(),
        Err(HistoryReplayError::Transaction {
            direction: ReplayDirection::Redo,
            source: Box::new(TransactionApplyError::Revision(RevisionError::Overflow)),
        })
    );
    assert_eq!(restored.state(), &state_before);
    assert_eq!(restored.history_status(), status_before);
    Ok(())
}

#[test]
fn checkpoint_bytes_remain_stable_after_equivalent_history_traversal() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "session-checkpoint-byte-stability", None, None)?;
    let mut original = EditorSession::new(initial);
    for (offset, text) in [(1, "b"), (2, "c")] {
        let transaction =
            insert_transaction(original.state(), offset, text, HistoryIntent::Record, None, None)?;
        apply(&mut original, &transaction)?;
    }
    history_commit(original.undo())?;

    let codec = SessionCheckpointJsonCodec::new(context);
    let (_, mut restored) = round_trip(&codec, &original)?;
    let original_redo = history_commit(original.redo())?;
    let restored_redo = history_commit(restored.redo())?;
    assert_eq!(original_redo, restored_redo);
    assert_sessions_equal(&original, &restored);
    assert_eq!(codec.encode(&original)?, codec.encode(&restored)?);

    let original_undo = history_commit(original.undo())?;
    let restored_undo = history_commit(restored.undo())?;
    assert_eq!(original_undo, restored_undo);
    assert_sessions_equal(&original, &restored);
    assert_eq!(codec.encode(&original)?, codec.encode(&restored)?);
    Ok(())
}

#[test]
fn every_native_operation_kind_survives_one_chronological_history_checkpoint() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "ab", "session-checkpoint-all-operations", None, None)?;
    let mut original = EditorSession::new(initial);

    let insertion =
        insert_transaction(original.state(), 2, "c", HistoryIntent::Record, None, None)?;
    apply(&mut original, &insertion)?;
    assert_single_text(original.state().document(), "abc")?;

    let split = ParagraphSplit::capture(
        &context,
        original.state().document(),
        path(&[0])?,
        TextOffset::try_new(1)?,
    )?;
    apply_recorded_operation(&mut original, split.into())?;

    let replacement_range = RootTextRange::try_new(
        RootTextBoundary::try_new(path(&[0])?, TextOffset::try_new(1)?)?,
        RootTextBoundary::try_new(path(&[1])?, TextOffset::ZERO)?,
    )?;
    let replacement = RootTextReplace::capture(
        &context,
        original.state().document(),
        replacement_range,
        vec![fragment("X")?, fragment("Y")?],
    )?;
    apply_recorded_operation(&mut original, replacement.into())?;

    let join = ParagraphJoin::capture(&context, original.state().document(), path(&[0])?)?;
    apply_recorded_operation(&mut original, join.into())?;
    assert_single_text(original.state().document(), "aXYbc")?;
    assert_eq!(original.undo_depth(), 4);

    history_commit(original.undo())?;
    history_commit(original.undo())?;
    assert_eq!((original.undo_depth(), original.redo_depth()), (2, 2));

    let codec = SessionCheckpointJsonCodec::new(context);
    let (encoded, mut restored) = round_trip(&codec, &original)?;
    let record: Value = serde_json::from_str(&encoded)?;
    let operation_kinds = record["entries"]
        .as_array()
        .ok_or_else(|| test_error("checkpoint entries were not an array"))?
        .iter()
        .map(|entry| entry["forwardOperations"][0]["kind"].as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        operation_kinds,
        vec![
            Some("textSplice"),
            Some("paragraphSplit"),
            Some("rootTextReplace"),
            Some("paragraphJoin"),
        ]
    );

    assert_history_lockstep(&mut original, &mut restored)?;
    assert_single_text(original.state().document(), "aXYbc")?;
    assert_eq!(restored.state(), original.state());
    Ok(())
}
