//! Black-box contracts for exact session publication and bounded linear history.

mod support;

use breditor_core::{
    action::{
        ActionExecutionError, ActionInvocation, PreparedActionExecutionError,
        builtins::{
            base_action_registry, delete_backward_action_id, insert_paragraph_break_action_id,
        },
    },
    codec::DocumentJsonCodec,
    document::{Document, FormatSet, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{TextRange, TextSplice},
    position::{Affinity, Point, TextOffset},
    selection::{RangeSelection, Selection},
    session::{
        DEFAULT_HISTORY_CAPACITY, EditorSession, HistoryCapacity, HistoryCapacityError,
        MAX_HISTORY_CAPACITY, SessionCommitError,
    },
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{
        Commit, HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction,
        TransactionMetadata, TransactionOutcome,
    },
};
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn selection(
    offset: u32,
    anchor_affinity: Affinity,
    focus_affinity: Affinity,
) -> Result<Selection, Box<dyn std::error::Error>> {
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

fn state(
    context: &EditorContext,
    text: &str,
    lineage: &str,
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn std::error::Error>> {
    let children = if text.is_empty() { Vec::new() } else { vec![text_node(text, false)] };
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(&[paragraph(&children)]))?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn fragment(text: &str) -> Result<TextFragment, Box<dyn std::error::Error>> {
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
) -> Result<Transaction, Box<dyn std::error::Error>> {
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
    history: HistoryIntent,
) -> Transaction {
    Transaction::new(state, Vec::new())
        .with_selection_update(SelectionUpdate::Set(result_selection))
        .with_pending_formats_update(PendingFormatsUpdate::Set(pending_formats))
        .with_metadata(TransactionMetadata::new(None, history))
}

fn apply(
    session: &mut EditorSession,
    transaction: &Transaction,
) -> Result<Commit, Box<dyn std::error::Error>> {
    session
        .apply_transaction(transaction)?
        .into_commit()
        .ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn committed(
    transaction: &Transaction,
    state: &EditorState,
) -> Result<Commit, Box<dyn std::error::Error>> {
    transaction
        .apply(state.context(), state)?
        .into_commit()
        .ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
}

fn history_commit(
    result: Result<Option<Commit>, breditor_core::session::HistoryReplayError>,
) -> Result<Commit, Box<dyn std::error::Error>> {
    result?.ok_or_else(|| test_error("history unexpectedly unavailable").into())
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

#[test]
fn record_undo_redo_restores_exact_cursor_values_and_monotonic_revision() -> TestResult {
    let context = EditorContext::default();
    let before_selection = selection(1, Affinity::After, Affinity::Before)?;
    let before_formats = FormatSet::default();
    let initial = state(
        &context,
        "abc",
        "session-record",
        Some(before_selection.clone()),
        Some(before_formats.clone()),
    )?;
    let after_selection = selection(4, Affinity::Before, Affinity::After)?;
    let mut session = EditorSession::new(initial.clone());
    let edit = insert_transaction(
        session.state(),
        3,
        "X",
        HistoryIntent::Record,
        Some(after_selection.clone()),
        None,
    )?;
    let edit_commit = apply(&mut session, &edit)?;
    assert_eq!(edit_commit.revision(), Revision::new(1));
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 0);

    let undo = history_commit(session.undo())?;
    assert_eq!(undo.base_revision(), Revision::new(1));
    assert_eq!(undo.revision(), Revision::new(2));
    assert_eq!(undo.metadata().action().map(QualifiedName::as_str), Some("breditor/undo"));
    assert_eq!(undo.metadata().history(), &HistoryIntent::Ignore);
    assert_eq!(session.state().document(), initial.document());
    assert_eq!(session.state().selection(), Some(&before_selection));
    assert_eq!(session.state().pending_formats(), Some(&before_formats));
    assert!(!session.can_undo());
    assert!(session.can_redo());

    let redo = history_commit(session.redo())?;
    assert_eq!(redo.base_revision(), Revision::new(2));
    assert_eq!(redo.revision(), Revision::new(3));
    assert_eq!(redo.metadata().action().map(QualifiedName::as_str), Some("breditor/redo"));
    assert_eq!(redo.metadata().history(), &HistoryIntent::Ignore);
    assert_single_text(session.state().document(), "abcX")?;
    assert_eq!(session.state().selection(), Some(&after_selection));
    assert_eq!(session.state().pending_formats(), None);
    Ok(())
}

#[test]
fn merged_entry_uses_first_before_and_last_after_cursor() -> TestResult {
    let context = EditorContext::default();
    let before_selection = selection(1, Affinity::Before, Affinity::After)?;
    let before_formats = FormatSet::default();
    let initial = state(
        &context,
        "a",
        "session-merge",
        Some(before_selection.clone()),
        Some(before_formats.clone()),
    )?;
    let mut session = EditorSession::new(initial.clone());
    let group = QualifiedName::try_new("test/typing")?;
    let middle_selection = selection(2, Affinity::After, Affinity::Before)?;
    let first = insert_transaction(
        session.state(),
        1,
        "b",
        HistoryIntent::Merge { group: group.clone() },
        Some(middle_selection),
        None,
    )?;
    apply(&mut session, &first)?;
    let final_selection = selection(3, Affinity::Before, Affinity::After)?;
    let final_formats = FormatSet::default();
    let second = insert_transaction(
        session.state(),
        2,
        "c",
        HistoryIntent::Merge { group },
        Some(final_selection.clone()),
        Some(final_formats.clone()),
    )?;
    apply(&mut session, &second)?;
    assert_eq!(session.undo_depth(), 1);

    history_commit(session.undo())?;
    assert_eq!(session.state().document(), initial.document());
    assert_eq!(session.state().selection(), Some(&before_selection));
    assert_eq!(session.state().pending_formats(), Some(&before_formats));
    history_commit(session.redo())?;
    assert_single_text(session.state().document(), "abc")?;
    assert_eq!(session.state().selection(), Some(&final_selection));
    assert_eq!(session.state().pending_formats(), Some(&final_formats));
    assert_eq!(session.state().snapshot().revision(), Revision::new(4));
    Ok(())
}

#[test]
fn state_only_commit_updates_both_adjacent_history_boundaries() -> TestResult {
    let context = EditorContext::default();
    let initial_selection = selection(1, Affinity::Before, Affinity::After)?;
    let initial =
        state(&context, "a", "session-cursor-boundaries", Some(initial_selection.clone()), None)?;
    let mut session = EditorSession::new(initial);
    let after_a = selection(2, Affinity::Before, Affinity::After)?;
    let a =
        insert_transaction(session.state(), 1, "b", HistoryIntent::Record, Some(after_a), None)?;
    apply(&mut session, &a)?;
    let after_b = selection(3, Affinity::After, Affinity::Before)?;
    let b = insert_transaction(
        session.state(),
        2,
        "c",
        HistoryIntent::Record,
        Some(after_b.clone()),
        None,
    )?;
    apply(&mut session, &b)?;
    history_commit(session.undo())?;
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 1);

    let middle_selection = selection(0, Affinity::After, Affinity::Before)?;
    let middle_formats = FormatSet::default();
    let cursor = state_only_transaction(
        session.state(),
        Some(middle_selection.clone()),
        Some(middle_formats.clone()),
        HistoryIntent::Ignore,
    );
    let cursor_commit = apply(&mut session, &cursor)?;
    assert!(cursor_commit.forward_operations().is_empty());
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 1);

    history_commit(session.undo())?;
    assert_eq!(session.state().selection(), Some(&initial_selection));
    history_commit(session.redo())?;
    assert_eq!(session.state().selection(), Some(&middle_selection));
    assert_eq!(session.state().pending_formats(), Some(&middle_formats));
    history_commit(session.redo())?;
    assert_eq!(session.state().selection(), Some(&after_b));
    history_commit(session.undo())?;
    assert_eq!(session.state().selection(), Some(&middle_selection));
    assert_eq!(session.state().pending_formats(), Some(&middle_formats));
    Ok(())
}

#[test]
fn state_only_commits_define_cursor_boundaries_at_both_history_edges() -> TestResult {
    let context = EditorContext::default();
    let initial_selection = selection(1, Affinity::Before, Affinity::After)?;
    let before_state =
        state(&context, "a", "session-cursor-before-edge", Some(initial_selection.clone()), None)?;
    let mut before = EditorSession::new(before_state);
    let latest_before_selection = selection(0, Affinity::After, Affinity::Before)?;
    let latest_before_formats = FormatSet::default();
    let cursor_before = state_only_transaction(
        before.state(),
        Some(latest_before_selection.clone()),
        Some(latest_before_formats.clone()),
        HistoryIntent::Record,
    );
    apply(&mut before, &cursor_before)?;
    assert_eq!(before.undo_depth(), 0);
    let before_edge_edit = insert_transaction(
        before.state(),
        1,
        "b",
        HistoryIntent::Record,
        Some(selection(2, Affinity::Before, Affinity::After)?),
        None,
    )?;
    apply(&mut before, &before_edge_edit)?;
    history_commit(before.undo())?;
    assert_eq!(before.state().selection(), Some(&latest_before_selection));
    assert_eq!(before.state().pending_formats(), Some(&latest_before_formats));

    let after_state =
        state(&context, "a", "session-cursor-after-edge", Some(initial_selection.clone()), None)?;
    let mut after = EditorSession::new(after_state);
    let after_edge_edit = insert_transaction(
        after.state(),
        1,
        "b",
        HistoryIntent::Record,
        Some(selection(2, Affinity::Before, Affinity::After)?),
        None,
    )?;
    apply(&mut after, &after_edge_edit)?;
    let latest_after_selection = selection(0, Affinity::After, Affinity::Before)?;
    let latest_after_formats = FormatSet::default();
    let cursor_after = state_only_transaction(
        after.state(),
        Some(latest_after_selection.clone()),
        Some(latest_after_formats.clone()),
        HistoryIntent::Ignore,
    );
    apply(&mut after, &cursor_after)?;
    history_commit(after.undo())?;
    assert_eq!(after.state().selection(), Some(&initial_selection));
    assert_eq!(after.state().pending_formats(), None);
    history_commit(after.redo())?;
    assert_eq!(after.state().selection(), Some(&latest_after_selection));
    assert_eq!(after.state().pending_formats(), Some(&latest_after_formats));
    Ok(())
}

#[test]
fn explicit_and_implicit_boundaries_split_merge_groups() -> TestResult {
    let context = EditorContext::default();
    let initial_selection = selection(1, Affinity::Before, Affinity::After)?;
    let initial = state(&context, "a", "session-merge-boundaries", Some(initial_selection), None)?;
    let mut session = EditorSession::new(initial);
    let group = QualifiedName::try_new("test/group")?;
    let first = insert_transaction(
        session.state(),
        1,
        "b",
        HistoryIntent::Merge { group: group.clone() },
        None,
        None,
    )?;
    apply(&mut session, &first)?;
    assert!(session.redo()?.is_none());
    let second = insert_transaction(
        session.state(),
        2,
        "c",
        HistoryIntent::Merge { group: group.clone() },
        None,
        None,
    )?;
    apply(&mut session, &second)?;
    assert_eq!(session.undo_depth(), 1);
    session.close_history_group();
    let third = insert_transaction(
        session.state(),
        3,
        "d",
        HistoryIntent::Merge { group: group.clone() },
        None,
        None,
    )?;
    apply(&mut session, &third)?;
    assert_eq!(session.undo_depth(), 2);

    let cursor = state_only_transaction(session.state(), None, None, HistoryIntent::Record);
    assert!(session.apply_transaction(&cursor)?.is_unchanged());
    let actual_cursor = state_only_transaction(
        session.state(),
        Some(selection(0, Affinity::Before, Affinity::After)?),
        None,
        HistoryIntent::Merge { group: group.clone() },
    );
    apply(&mut session, &actual_cursor)?;
    let fourth =
        insert_transaction(session.state(), 4, "e", HistoryIntent::Merge { group }, None, None)?;
    apply(&mut session, &fourth)?;
    assert_eq!(session.undo_depth(), 3);
    Ok(())
}

#[test]
fn merge_splits_at_operation_cap_and_replays_each_chunk_atomically() -> TestResult {
    let context = EditorContext::default().with_max_operations_per_transaction(2);
    let initial = state(&context, "a", "session-operation-cap", None, None)?;
    let mut session = EditorSession::new(initial);
    let group = QualifiedName::try_new("test/capped-group")?;
    for (offset, text) in [(1, "b"), (2, "c"), (3, "d")] {
        let transaction = insert_transaction(
            session.state(),
            offset,
            text,
            HistoryIntent::Merge { group: group.clone() },
            None,
            None,
        )?;
        apply(&mut session, &transaction)?;
    }
    assert_eq!(session.undo_depth(), 2);
    assert_eq!(session.state().snapshot().revision(), Revision::new(3));
    history_commit(session.undo())?;
    assert_single_text(session.state().document(), "abc")?;
    assert_eq!(session.state().snapshot().revision(), Revision::new(4));
    history_commit(session.undo())?;
    assert_single_text(session.state().document(), "a")?;
    assert_eq!(session.state().snapshot().revision(), Revision::new(5));
    history_commit(session.redo())?;
    assert_single_text(session.state().document(), "abc")?;
    history_commit(session.redo())?;
    assert_single_text(session.state().document(), "abcd")?;
    assert_eq!(session.state().snapshot().revision(), Revision::new(7));
    Ok(())
}

#[test]
fn new_content_after_undo_clears_redo_without_merging_across_traversal() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "session-new-branch", None, None)?;
    let mut session = EditorSession::new(initial);
    let group = QualifiedName::try_new("test/branch-group")?;
    let a = insert_transaction(
        session.state(),
        1,
        "b",
        HistoryIntent::Merge { group: group.clone() },
        None,
        None,
    )?;
    apply(&mut session, &a)?;
    let b = insert_transaction(session.state(), 2, "c", HistoryIntent::Record, None, None)?;
    apply(&mut session, &b)?;
    history_commit(session.undo())?;
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 1);

    let c =
        insert_transaction(session.state(), 2, "X", HistoryIntent::Merge { group }, None, None)?;
    apply(&mut session, &c)?;
    assert_eq!(session.undo_depth(), 2);
    assert_eq!(session.redo_depth(), 0);
    assert!(session.redo()?.is_none());
    history_commit(session.undo())?;
    assert_single_text(session.state().document(), "ab")?;
    Ok(())
}

#[test]
fn content_ignore_clears_both_history_sides() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "session-ignore", None, None)?;
    let mut session = EditorSession::new(initial);
    for (offset, text) in [(1, "b"), (2, "c")] {
        let transaction =
            insert_transaction(session.state(), offset, text, HistoryIntent::Record, None, None)?;
        apply(&mut session, &transaction)?;
    }
    history_commit(session.undo())?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 1));
    let ignored = insert_transaction(session.state(), 2, "X", HistoryIntent::Ignore, None, None)?;
    apply(&mut session, &ignored)?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 0));
    assert!(session.undo()?.is_none());
    assert!(session.redo()?.is_none());
    assert_single_text(session.state().document(), "abX")?;
    Ok(())
}

#[test]
fn net_zero_content_operations_still_form_a_history_entry() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "session-net-zero", None, None)?;
    let initial_document = initial.document().clone();
    let at_end = TextOffset::try_new(1)?;
    let after_insert = TextOffset::try_new(2)?;
    let insert = TextSplice::try_new(
        TextRange::try_new(path(&[0])?, at_end, at_end)?,
        TextFragment::empty(),
        fragment("b")?,
    )?;
    let delete = TextSplice::try_new(
        TextRange::try_new(path(&[0])?, at_end, after_insert)?,
        fragment("b")?,
        TextFragment::empty(),
    )?;
    let transaction = Transaction::new(&initial, vec![insert.into(), delete.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    let mut session = EditorSession::new(initial);
    let commit = apply(&mut session, &transaction)?;
    assert_eq!(commit.forward_operations().len(), 2);
    assert_eq!(session.state().document(), &initial_document);
    assert_eq!(session.undo_depth(), 1);
    let undo = history_commit(session.undo())?;
    assert_eq!(undo.forward_operations().len(), 2);
    assert_eq!(session.state().document(), &initial_document);
    let redo = history_commit(session.redo())?;
    assert_eq!(redo.forward_operations().len(), 2);
    assert_eq!(session.state().document(), &initial_document);
    assert_eq!(session.state().snapshot().revision(), Revision::new(3));
    Ok(())
}

#[test]
fn capacity_zero_one_and_fixed_bounds_are_deterministic() -> TestResult {
    assert_eq!(HistoryCapacity::default().get(), DEFAULT_HISTORY_CAPACITY);
    assert_eq!(HistoryCapacity::try_new(MAX_HISTORY_CAPACITY)?.get(), MAX_HISTORY_CAPACITY);
    assert_eq!(
        HistoryCapacity::try_new(MAX_HISTORY_CAPACITY + 1),
        Err(HistoryCapacityError::TooLarge {
            actual: MAX_HISTORY_CAPACITY + 1,
            maximum: MAX_HISTORY_CAPACITY,
        })
    );

    let context = EditorContext::default();
    let disabled_state = state(&context, "a", "session-capacity-zero", None, None)?;
    let mut disabled =
        EditorSession::with_history_capacity(disabled_state, HistoryCapacity::DISABLED);
    let disabled_edit =
        insert_transaction(disabled.state(), 1, "b", HistoryIntent::Record, None, None)?;
    apply(&mut disabled, &disabled_edit)?;
    assert_eq!((disabled.undo_depth(), disabled.redo_depth()), (0, 0));

    let one_state = state(&context, "a", "session-capacity-one", None, None)?;
    let mut one = EditorSession::with_history_capacity(one_state, HistoryCapacity::try_new(1)?);
    for (offset, text) in [(1, "b"), (2, "c")] {
        let transaction =
            insert_transaction(one.state(), offset, text, HistoryIntent::Record, None, None)?;
        apply(&mut one, &transaction)?;
    }
    assert_eq!(one.undo_depth(), 1);
    history_commit(one.undo())?;
    assert_single_text(one.state().document(), "ab")?;
    assert!(one.undo()?.is_none());
    history_commit(one.redo())?;
    assert_single_text(one.state().document(), "abc")?;

    let merged_state = state(&context, "a", "session-capacity-one-merge", None, None)?;
    let mut merged =
        EditorSession::with_history_capacity(merged_state, HistoryCapacity::try_new(1)?);
    let group = QualifiedName::try_new("test/capacity-merge")?;
    for (offset, text) in [(1, "b"), (2, "c")] {
        let transaction = insert_transaction(
            merged.state(),
            offset,
            text,
            HistoryIntent::Merge { group: group.clone() },
            None,
            None,
        )?;
        apply(&mut merged, &transaction)?;
    }
    assert_eq!(merged.undo_depth(), 1);
    history_commit(merged.undo())?;
    assert_single_text(merged.state().document(), "a")?;
    Ok(())
}

#[test]
fn exact_commit_acceptance_rejects_stale_and_reused_snapshot_branches_atomically() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "x", "session-accept", None, None)?;
    let group = QualifiedName::try_new("test/accept-group")?;
    let a_transaction = insert_transaction(
        &initial,
        1,
        "a",
        HistoryIntent::Merge { group: group.clone() },
        None,
        None,
    )?;
    let a = committed(&a_transaction, &initial)?;
    let branch_transaction =
        insert_transaction(&initial, 1, "b", HistoryIntent::Record, None, None)?;
    let branch = committed(&branch_transaction, &initial)?;
    let branch_successor_transaction =
        insert_transaction(branch.after(), 2, "c", HistoryIntent::Record, None, None)?;
    let branch_successor = committed(&branch_successor_transaction, branch.after())?;

    let mut session = EditorSession::new(initial);
    session.accept_commit(&a)?;
    assert_eq!(session.undo_depth(), 1);
    let after_a = session.state().clone();
    assert_eq!(
        session.accept_commit(&branch),
        Err(SessionCommitError::StaleSnapshot {
            expected: after_a.snapshot().clone(),
            actual: branch.base_snapshot().clone(),
        })
    );
    assert_eq!(session.state(), &after_a);
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(
        session.accept_commit(&branch_successor),
        Err(SessionCommitError::BaseStateMismatch { snapshot: after_a.snapshot().clone() })
    );
    assert_eq!(session.state(), &after_a);
    assert_eq!(session.undo_depth(), 1);

    let c_transaction =
        insert_transaction(session.state(), 2, "c", HistoryIntent::Merge { group }, None, None)?;
    let c = committed(&c_transaction, session.state())?;
    session.accept_commit(&c)?;
    assert_eq!(session.undo_depth(), 1, "failed acceptance must not close merge group");
    assert_single_text(session.state().document(), "xac")?;
    Ok(())
}

#[test]
fn prepared_actions_publish_once_and_stale_queued_preparations_fail_closed() -> TestResult {
    let context = EditorContext::default();
    let cursor = selection(4, Affinity::Before, Affinity::After)?;
    let initial =
        state(&context, "abcd", "session-actions", Some(cursor), Some(FormatSet::default()))?;
    let registry = base_action_registry()?;
    let invocation = ActionInvocation::without_input(delete_backward_action_id());
    let first = registry.prepare(&initial, &invocation)?;
    let stale = registry.prepare(&initial, &invocation)?;
    let mut session = EditorSession::new(initial);
    session.execute_prepared_action(first)?;
    assert_single_text(session.state().document(), "abc")?;
    let after_first = session.state().clone();
    assert!(matches!(
        session.execute_prepared_action(stale),
        Err(ActionExecutionError::Prepared(PreparedActionExecutionError::StaleSnapshot { .. }))
    ));
    assert_eq!(session.state(), &after_first);

    for _ in 0..2 {
        let prepared = registry.prepare(session.state(), &invocation)?;
        session.execute_prepared_action(prepared)?;
    }
    assert_single_text(session.state().document(), "a")?;
    assert_eq!(session.undo_depth(), 1);
    history_commit(session.undo())?;
    assert_single_text(session.state().document(), "abcd")?;
    history_commit(session.redo())?;
    assert_single_text(session.state().document(), "a")?;

    let enter_invocation = ActionInvocation::without_input(insert_paragraph_break_action_id());
    let enter = registry.prepare(session.state(), &enter_invocation)?;
    session.execute_prepared_action(enter)?;
    let Some(root) = session.state().document().root().as_element() else {
        return Err(test_error("document root was not an element").into());
    };
    assert_eq!(root.children().len(), 2);
    assert_eq!(session.undo_depth(), 2);
    history_commit(session.undo())?;
    assert_single_text(session.state().document(), "a")?;
    Ok(())
}

#[test]
fn clear_history_does_not_change_current_state() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "session-clear", None, None)?;
    let mut session = EditorSession::new(initial);
    let edit = insert_transaction(session.state(), 1, "b", HistoryIntent::Record, None, None)?;
    apply(&mut session, &edit)?;
    let current = session.state().clone();
    session.clear_history();
    assert_eq!(session.state(), &current);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 0));
    Ok(())
}

#[test]
fn session_debug_redacts_current_and_retained_document_content() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "private-payload", "session-debug", None, None)?;
    let end = TextOffset::try_new(15)?;
    let range = TextRange::try_new(path(&[0])?, TextOffset::ZERO, end)?;
    let deletion = TextSplice::capture(&context, initial.document(), range, TextFragment::empty())?;
    let transaction = Transaction::new(&initial, vec![deletion.into()])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    let mut session = EditorSession::new(initial);
    apply(&mut session, &transaction)?;
    let debug = format!("{session:?}");
    assert!(!debug.contains("private-payload"));
    assert!(debug.contains("undo_depth"));
    Ok(())
}

#[test]
fn transaction_outcome_type_remains_the_session_notification_contract() -> TestResult {
    let context = EditorContext::default();
    let initial = state(&context, "a", "session-outcome", None, None)?;
    let mut session = EditorSession::new(initial);
    let unchanged = Transaction::new(session.state(), Vec::new());
    assert_eq!(session.apply_transaction(&unchanged)?, TransactionOutcome::Unchanged);
    assert_eq!(session.state().snapshot().revision(), Revision::ZERO);
    Ok(())
}
