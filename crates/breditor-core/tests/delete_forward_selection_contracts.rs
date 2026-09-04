//! Black-box contracts for forward and explicit selection deletion.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionExecutionError, ActionId, ActionInvocation, ActionPreparation, ActionRegistry,
        PreparedAction,
        builtins::{
            base_action_registry, delete_backward_action_id, delete_forward_action_id,
            delete_selection_action_id,
        },
    },
    codec::DocumentJsonCodec,
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{
        DeletedPointPolicy, Operation, ParagraphJoin, ParagraphSplit, RootTextBoundary,
        RootTextRange, RootTextReplace, SelectionRelocationPolicy, TextRange, TextSplice,
    },
    position::{Affinity, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    selection::{RangeSelection, ResolvedSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{Commit, HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
};
use serde_json::Value;
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn formats(strong: bool) -> Result<FormatSet, Box<dyn Error>> {
    if !strong {
        return Ok(FormatSet::default());
    }
    Ok(FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])?)
}

fn fragment(runs: &[(&str, bool)]) -> Result<TextFragment, Box<dyn Error>> {
    TextFragment::try_from_runs(
        runs.iter()
            .map(|(text, strong)| TextRun::try_new(*text, formats(*strong)?).map_err(Into::into))
            .collect::<Result<Vec<_>, Box<dyn Error>>>()?,
    )
    .map_err(Into::into)
}

fn paragraph_value(runs: &[(&str, bool)]) -> Value {
    paragraph(&runs.iter().map(|(text, strong)| text_node(text, *strong)).collect::<Vec<_>>())
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    selection: Option<Selection>,
    pending_formats: Option<FormatSet>,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(paragraphs))?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn text_point(
    paragraph_index: u32,
    text_index: u32,
    utf16_offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[paragraph_index, text_index])?, utf16_offset, affinity })
}

fn child_point(
    paragraph_index: u32,
    child_index: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children { parent_path: path(&[paragraph_index])?, child_index, affinity })
}

fn collapsed(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn invocation(id: ActionId) -> ActionInvocation {
    ActionInvocation::without_input(id)
}

fn enabled(
    registry: &ActionRegistry,
    state: &EditorState,
    id: ActionId,
) -> Result<PreparedAction, Box<dyn Error>> {
    match registry.prepare(state, &invocation(id))? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => {
            Err(test_error(format!("deletion unexpectedly disabled: {}", prepared.reason().code()))
                .into())
        }
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    id: ActionId,
    expected_code: &str,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(disabled) = registry.prepare(state, &invocation(id))? else {
        return Err(test_error(format!("expected disabled reason {expected_code}")).into());
    };
    let reason = disabled.reason().clone();
    assert_eq!(disabled.base_state(), state);
    assert_eq!(reason.code().as_str(), expected_code);
    assert_eq!(reason.detail(), None);
    assert_eq!(state, &original);
    assert_eq!(
        ActionPreparation::Disabled(disabled).execute(state),
        Err(ActionExecutionError::Disabled { reason })
    );
    assert_eq!(state, &original);
    Ok(())
}

fn strict_relocation() -> SelectionRelocationPolicy {
    SelectionRelocationPolicy::new(DeletedPointPolicy::Reject, DeletedPointPolicy::Reject)
}

fn assert_plan(
    prepared: &PreparedAction,
    operation: &Operation,
    selection: &Selection,
    pending_formats: Option<FormatSet>,
    history: &HistoryIntent,
) {
    let transaction = prepared.transaction();
    assert_eq!(transaction.operations(), std::slice::from_ref(operation));
    assert_eq!(transaction.selection_relocation(), strict_relocation());
    assert_eq!(transaction.selection_update(), &SelectionUpdate::Set(Some(selection.clone())));
    assert_eq!(transaction.pending_formats_update(), &PendingFormatsUpdate::Set(pending_formats));
    assert_eq!(transaction.metadata().action(), Some(prepared.id().qualified_name()));
    assert_eq!(transaction.metadata().history(), history);
}

fn assert_commit(
    commit: &Commit,
    action: &ActionId,
    operation: &Operation,
    history: &HistoryIntent,
) {
    assert_eq!(commit.forward_operations(), std::slice::from_ref(operation));
    assert_eq!(commit.metadata().action(), Some(action.qualified_name()));
    assert_eq!(commit.metadata().history(), history);
}

fn assert_paragraph_count(document: &Document, expected: usize) -> TestResult {
    let root = document
        .root()
        .as_element()
        .ok_or_else(|| test_error("validated root was not an element"))?;
    assert_eq!(root.children().len(), expected);
    Ok(())
}

fn assert_paragraph_runs(
    document: &Document,
    paragraph_index: usize,
    expected: &[(&str, bool)],
) -> TestResult {
    let root = document
        .root()
        .as_element()
        .ok_or_else(|| test_error("validated root was not an element"))?;
    let paragraph = root
        .children()
        .get(paragraph_index)
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| test_error(format!("paragraph {paragraph_index} is missing")))?;
    assert_eq!(paragraph.children().len(), expected.len());
    for (child, (expected_text, expected_strong)) in paragraph.children().iter().zip(expected) {
        let text = child.as_text().ok_or_else(|| test_error("paragraph child was not text"))?;
        assert_eq!(text.text(), *expected_text);
        assert_eq!(text.formats(), &formats(*expected_strong)?);
    }
    Ok(())
}

fn assert_exact_caret(state: &EditorState, expected: &Point) -> TestResult {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(test_error("result did not contain a range selection").into());
    };
    assert_eq!(range.anchor(), expected);
    assert_eq!(range.focus(), expected);
    let ResolvedSelection::Range(resolved) =
        Selection::from(range.clone()).resolve(state.context().schema(), state.document())?;
    assert!(resolved.is_collapsed());
    Ok(())
}

fn assert_same_editor_value(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.context(), expected.context());
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

#[test]
#[allow(clippy::too_many_lines)]
fn forward_delete_removes_one_complete_egc_with_an_exact_splice() -> TestResult {
    struct Case {
        lineage: &'static str,
        source: Vec<(&'static str, bool)>,
        removed: Vec<(&'static str, bool)>,
        end: u64,
        result: Vec<(&'static str, bool)>,
    }

    let cases = [
        Case {
            lineage: "delete-forward-ascii",
            source: vec![("ab", false)],
            removed: vec![("a", false)],
            end: 1,
            result: vec![("b", false)],
        },
        Case {
            lineage: "delete-forward-non-bmp",
            source: vec![("😀x", false)],
            removed: vec![("😀", false)],
            end: 2,
            result: vec![("x", false)],
        },
        Case {
            lineage: "delete-forward-format-seam",
            source: vec![("e", false), ("\u{301}x", true)],
            removed: vec![("e", false), ("\u{301}", true)],
            end: 2,
            result: vec![("x", true)],
        },
        Case {
            lineage: "delete-forward-zwj-family",
            source: vec![("👨‍👩‍👧‍👦x", false)],
            removed: vec![("👨‍👩‍👧‍👦", false)],
            end: 11,
            result: vec![("x", false)],
        },
        Case {
            lineage: "delete-forward-regional-pair",
            source: vec![("🇨🇦x", false)],
            removed: vec![("🇨🇦", false)],
            end: 4,
            result: vec![("x", false)],
        },
    ];
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let action = delete_forward_action_id();
    let history = HistoryIntent::Merge { group: action.qualified_name().clone() };

    for case in cases {
        let pending = formats(true)?;
        let initial = state(
            &context,
            &[paragraph_value(&case.source)],
            Some(collapsed(text_point(0, 0, 0, Affinity::After)?)),
            Some(pending.clone()),
            case.lineage,
        )?;
        let expected_removed = fragment(&case.removed)?;
        let range =
            TextRange::try_new(path(&[0])?, TextOffset::ZERO, TextOffset::try_new(case.end)?)?;
        let operation = Operation::from(TextSplice::try_new(
            range,
            expected_removed.clone(),
            TextFragment::empty(),
        )?);
        let result_point = text_point(0, 0, 0, Affinity::Before)?;
        let result_selection = collapsed(result_point.clone());
        let prepared = enabled(&registry, &initial, action.clone())?;
        assert_plan(&prepared, &operation, &result_selection, Some(pending.clone()), &history);

        let commit = prepared.execute(&initial)?;
        assert_commit(&commit, &action, &operation, &history);
        let inverse = Operation::from(TextSplice::try_new(
            TextRange::try_new(path(&[0])?, TextOffset::ZERO, TextOffset::ZERO)?,
            TextFragment::empty(),
            expected_removed,
        )?);
        assert_eq!(commit.inverse_operations(), &[inverse]);
        assert_paragraph_runs(commit.after().document(), 0, &case.result)?;
        assert_exact_caret(commit.after(), &result_point)?;
        assert_eq!(commit.after().pending_formats(), Some(&pending));
    }
    Ok(())
}

#[test]
fn directional_delete_disables_a_caret_inside_an_egc_across_a_format_seam() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("e", false), ("\u{301}x", true)])],
        Some(collapsed(child_point(0, 1, Affinity::After)?)),
        Some(formats(true)?),
        "delete-inside-grapheme-seam",
    )?;
    for action in [delete_backward_action_id(), delete_forward_action_id()] {
        assert_disabled(&registry, &initial, action, "breditor/caret-not-grapheme-boundary")?;
    }
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn forward_delete_joins_the_next_paragraph_with_exact_guards_and_before_affinity() -> TestResult {
    struct Case {
        lineage: &'static str,
        left: Vec<(&'static str, bool)>,
        right: Vec<(&'static str, bool)>,
        source_caret: Point,
        result: Vec<(&'static str, bool)>,
        result_caret: Point,
    }

    let cases = [
        Case {
            lineage: "delete-forward-join-equal",
            left: vec![("a", false)],
            right: vec![("b", false)],
            source_caret: text_point(0, 0, 1, Affinity::After)?,
            result: vec![("ab", false)],
            result_caret: text_point(0, 0, 1, Affinity::Before)?,
        },
        Case {
            lineage: "delete-forward-join-unequal",
            left: vec![("a", false)],
            right: vec![("B", true)],
            source_caret: text_point(0, 0, 1, Affinity::After)?,
            result: vec![("a", false), ("B", true)],
            result_caret: text_point(0, 1, 0, Affinity::Before)?,
        },
        Case {
            lineage: "delete-forward-join-empty-left",
            left: vec![],
            right: vec![("B", true)],
            source_caret: child_point(0, 0, Affinity::After)?,
            result: vec![("B", true)],
            result_caret: text_point(0, 0, 0, Affinity::Before)?,
        },
        Case {
            lineage: "delete-forward-join-empty-right",
            left: vec![("a", false)],
            right: vec![],
            source_caret: text_point(0, 0, 1, Affinity::After)?,
            result: vec![("a", false)],
            result_caret: text_point(0, 0, 1, Affinity::Before)?,
        },
        Case {
            lineage: "delete-forward-join-both-empty",
            left: vec![],
            right: vec![],
            source_caret: child_point(0, 0, Affinity::After)?,
            result: vec![],
            result_caret: child_point(0, 0, Affinity::Before)?,
        },
    ];
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let action = delete_forward_action_id();
    let history = HistoryIntent::Merge { group: action.qualified_name().clone() };

    for case in cases {
        let pending = formats(true)?;
        let initial = state(
            &context,
            &[paragraph_value(&case.left), paragraph_value(&case.right)],
            Some(collapsed(case.source_caret)),
            Some(pending.clone()),
            case.lineage,
        )?;
        let expected_left = fragment(&case.left)?;
        let expected_right = fragment(&case.right)?;
        let joined = expected_left.try_concat(&expected_right)?;
        let join =
            ParagraphJoin::try_new(path(&[0])?, expected_left.clone(), expected_right.clone())?;
        let operation = Operation::from(join);
        let result_selection = collapsed(case.result_caret.clone());
        let prepared = enabled(&registry, &initial, action.clone())?;
        assert_plan(&prepared, &operation, &result_selection, Some(pending.clone()), &history);

        let commit = prepared.execute(&initial)?;
        assert_commit(&commit, &action, &operation, &history);
        let inverse = Operation::from(ParagraphSplit::try_new(
            path(&[0])?,
            expected_left.utf16_len(),
            joined,
        )?);
        assert_eq!(commit.inverse_operations(), &[inverse]);
        assert_paragraph_count(commit.after().document(), 1)?;
        assert_paragraph_runs(commit.after().document(), 0, &case.result)?;
        assert_exact_caret(commit.after(), &case.result_caret)?;
        assert_eq!(commit.after().pending_formats(), Some(&pending));
    }

    let at_end = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::Before)?)),
        Some(formats(true)?),
        "delete-forward-document-end",
    )?;
    assert_disabled(&registry, &at_end, action, "breditor/at-document-end")?;
    Ok(())
}

#[test]
fn paragraph_joins_snap_a_new_cross_seam_grapheme_to_a_deletable_boundary() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let paragraphs = [paragraph_value(&[("a", false)]), paragraph_value(&[("\u{301}", true)])];

    let backward_initial = state(
        &context,
        &paragraphs,
        Some(collapsed(text_point(1, 0, 0, Affinity::After)?)),
        None,
        "delete-backward-cross-grapheme-join",
    )?;
    let backward_action = delete_backward_action_id();
    let backward_join = enabled(&registry, &backward_initial, backward_action.clone())?
        .execute(&backward_initial)?;
    assert_paragraph_runs(backward_join.after().document(), 0, &[("a", false), ("\u{301}", true)])?;
    assert_exact_caret(backward_join.after(), &text_point(0, 1, 1, Affinity::After)?)?;
    let backward_delete = enabled(&registry, backward_join.after(), backward_action)?
        .execute(backward_join.after())?;
    assert_paragraph_runs(backward_delete.after().document(), 0, &[])?;
    assert_exact_caret(backward_delete.after(), &child_point(0, 0, Affinity::After)?)?;

    let forward_initial = state(
        &context,
        &paragraphs,
        Some(collapsed(text_point(0, 0, 1, Affinity::Before)?)),
        None,
        "delete-forward-cross-grapheme-join",
    )?;
    let forward_action = delete_forward_action_id();
    let forward_join =
        enabled(&registry, &forward_initial, forward_action.clone())?.execute(&forward_initial)?;
    assert_paragraph_runs(forward_join.after().document(), 0, &[("a", false), ("\u{301}", true)])?;
    assert_exact_caret(forward_join.after(), &text_point(0, 0, 0, Affinity::Before)?)?;
    let forward_delete =
        enabled(&registry, forward_join.after(), forward_action)?.execute(forward_join.after())?;
    assert_paragraph_runs(forward_delete.after().document(), 0, &[])?;
    assert_exact_caret(forward_delete.after(), &child_point(0, 0, Affinity::Before)?)?;
    Ok(())
}

#[test]
fn text_deletions_snap_a_new_regional_indicator_pair_to_a_deletable_boundary() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let paragraphs = [paragraph_value(&[("🇦x🇧", false)])];

    let backward_initial = state(
        &context,
        &paragraphs,
        Some(collapsed(text_point(0, 0, 3, Affinity::After)?)),
        None,
        "delete-backward-regional-seam",
    )?;
    let backward_action = delete_backward_action_id();
    let backward_seam = enabled(&registry, &backward_initial, backward_action.clone())?
        .execute(&backward_initial)?;
    assert_paragraph_runs(backward_seam.after().document(), 0, &[("🇦🇧", false)])?;
    assert_exact_caret(backward_seam.after(), &text_point(0, 0, 4, Affinity::After)?)?;
    let backward_delete = enabled(&registry, backward_seam.after(), backward_action)?
        .execute(backward_seam.after())?;
    assert_paragraph_runs(backward_delete.after().document(), 0, &[])?;
    assert_exact_caret(backward_delete.after(), &child_point(0, 0, Affinity::After)?)?;

    let forward_initial = state(
        &context,
        &paragraphs,
        Some(collapsed(text_point(0, 0, 2, Affinity::Before)?)),
        None,
        "delete-forward-regional-seam",
    )?;
    let forward_action = delete_forward_action_id();
    let forward_seam =
        enabled(&registry, &forward_initial, forward_action.clone())?.execute(&forward_initial)?;
    assert_paragraph_runs(forward_seam.after().document(), 0, &[("🇦🇧", false)])?;
    assert_exact_caret(forward_seam.after(), &text_point(0, 0, 0, Affinity::Before)?)?;
    let forward_delete =
        enabled(&registry, forward_seam.after(), forward_action)?.execute(forward_seam.after())?;
    assert_paragraph_runs(forward_delete.after().document(), 0, &[])?;
    assert_exact_caret(forward_delete.after(), &child_point(0, 0, Affinity::Before)?)?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn extended_selection_deletion_is_direction_independent_and_uses_one_root_replace() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let paragraphs = [
        paragraph_value(&[("ab", false)]),
        paragraph_value(&[("middle", false)]),
        paragraph_value(&[("CD", true)]),
    ];
    let start = text_point(0, 0, 1, Affinity::Before)?;
    let end = text_point(2, 0, 1, Affinity::After)?;
    let result_point = text_point(0, 1, 0, Affinity::After)?;
    let result_selection = collapsed(result_point.clone());
    let range = RootTextRange::try_new(
        RootTextBoundary::try_new(path(&[0])?, TextOffset::try_new(1)?)?,
        RootTextBoundary::try_new(path(&[2])?, TextOffset::try_new(1)?)?,
    )?;
    let operation = Operation::from(RootTextReplace::try_new(
        range,
        vec![
            fragment(&[("ab", false)])?,
            fragment(&[("middle", false)])?,
            fragment(&[("CD", true)])?,
        ],
        vec![TextFragment::empty()],
    )?);
    let mut results = Vec::new();

    for action in [delete_selection_action_id(), delete_forward_action_id()] {
        for (direction, selection) in [
            ("forward", selected(start.clone(), end.clone())),
            ("backward", selected(end.clone(), start.clone())),
        ] {
            let initial = state(
                &context,
                &paragraphs,
                Some(selection),
                None,
                &format!("{}-{direction}", action.as_str().replace('/', "-")),
            )?;
            let prepared = enabled(&registry, &initial, action.clone())?;
            assert_plan(&prepared, &operation, &result_selection, None, &HistoryIntent::Record);
            let commit = prepared.execute(&initial)?;
            assert_commit(&commit, &action, &operation, &HistoryIntent::Record);
            assert!(matches!(commit.inverse_operations(), [Operation::RootTextReplace(_)]));
            assert_paragraph_count(commit.after().document(), 1)?;
            assert_paragraph_runs(commit.after().document(), 0, &[("a", false), ("D", true)])?;
            assert_exact_caret(commit.after(), &result_point)?;
            assert_eq!(commit.after().pending_formats(), None);
            results.push((commit.after().document().clone(), commit.after().selection().cloned()));
        }
    }
    assert!(results.windows(2).all(|pair| pair[0] == pair[1]));
    Ok(())
}

#[test]
fn explicit_selection_delete_rejects_a_collapsed_range_without_mutation() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("ab", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        Some(formats(true)?),
        "delete-selection-collapsed",
    )?;
    assert_disabled(
        &registry,
        &initial,
        delete_selection_action_id(),
        "breditor/collapsed-selection",
    )?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn selected_then_collapsed_forward_delete_remain_two_exact_undo_steps() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial_selection =
        selected(text_point(0, 0, 2, Affinity::After)?, text_point(0, 0, 1, Affinity::Before)?);
    let initial = state(
        &context,
        &[paragraph_value(&[("abc", false)])],
        Some(initial_selection),
        None,
        "delete-selection-then-forward-history",
    )?;
    let initial_value = initial.clone();
    let mut session = EditorSession::new(initial);

    let selection_action = delete_selection_action_id();
    let first_prepared = enabled(&registry, session.state(), selection_action.clone())?;
    let first_operation = first_prepared.transaction().operations()[0].clone();
    let first = session.execute_prepared_action(ActionPreparation::Enabled(first_prepared))?;
    assert_commit(&first, &selection_action, &first_operation, &HistoryIntent::Record);
    assert_paragraph_runs(session.state().document(), 0, &[("ac", false)])?;
    assert_exact_caret(session.state(), &text_point(0, 0, 1, Affinity::After)?)?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    let after_selection = session.state().clone();

    let forward_action = delete_forward_action_id();
    let forward_history = HistoryIntent::Merge { group: forward_action.qualified_name().clone() };
    let second_prepared = enabled(&registry, session.state(), forward_action.clone())?;
    let second_operation = second_prepared.transaction().operations()[0].clone();
    let second = session.execute_prepared_action(ActionPreparation::Enabled(second_prepared))?;
    assert_commit(&second, &forward_action, &second_operation, &forward_history);
    assert_paragraph_runs(session.state().document(), 0, &[("a", false)])?;
    assert_exact_caret(session.state(), &text_point(0, 0, 1, Affinity::Before)?)?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (2, 0));
    let final_value = session.state().clone();

    let Some(undo_forward) = session.undo()? else {
        return Err(test_error("forward deletion was not undoable").into());
    };
    assert_eq!(undo_forward.forward_operations(), second.inverse_operations());
    assert_eq!(undo_forward.metadata().action().map(QualifiedName::as_str), Some("breditor/undo"));
    assert_eq!(undo_forward.metadata().history(), &HistoryIntent::Ignore);
    assert_same_editor_value(session.state(), &after_selection);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 1));

    let Some(undo_selection) = session.undo()? else {
        return Err(test_error("selection deletion was not undoable").into());
    };
    assert_eq!(undo_selection.forward_operations(), first.inverse_operations());
    assert_same_editor_value(session.state(), &initial_value);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 2));

    let Some(redo_selection) = session.redo()? else {
        return Err(test_error("selection deletion was not redoable").into());
    };
    assert_eq!(redo_selection.forward_operations(), first.forward_operations());
    assert_same_editor_value(session.state(), &after_selection);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 1));

    let Some(redo_forward) = session.redo()? else {
        return Err(test_error("forward deletion was not redoable").into());
    };
    assert_eq!(redo_forward.forward_operations(), second.forward_operations());
    assert_same_editor_value(session.state(), &final_value);
    assert_eq!((session.undo_depth(), session.redo_depth()), (2, 0));
    Ok(())
}

#[test]
fn deletion_limits_disable_before_publication() -> TestResult {
    let registry = base_action_registry()?;
    let no_operations = EditorContext::default().with_max_operations_per_transaction(0);
    let forward = state(
        &no_operations,
        &[paragraph_value(&[("ab", false)])],
        Some(collapsed(text_point(0, 0, 0, Affinity::After)?)),
        Some(formats(true)?),
        "delete-forward-operation-limit",
    )?;
    assert_disabled(
        &registry,
        &forward,
        delete_forward_action_id(),
        "breditor/operation-budget-exceeded",
    )?;
    let backward_at_document_start = state(
        &no_operations,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 0, Affinity::After)?)),
        None,
        "delete-backward-edge-operation-limit",
    )?;
    assert_disabled(
        &registry,
        &backward_at_document_start,
        delete_backward_action_id(),
        "breditor/operation-budget-exceeded",
    )?;
    let forward_at_document_end = state(
        &no_operations,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::Before)?)),
        None,
        "delete-forward-edge-operation-limit",
    )?;
    assert_disabled(
        &registry,
        &forward_at_document_end,
        delete_forward_action_id(),
        "breditor/operation-budget-exceeded",
    )?;

    let fragmented_runs = (0..4_096).map(|index| ("x", index % 2 == 0)).collect::<Vec<_>>();
    let fragmented = state(
        &no_operations,
        &[paragraph_value(&fragmented_runs)],
        Some(collapsed(text_point(0, 0, 0, Affinity::After)?)),
        None,
        "delete-fragmented-operation-limit",
    )?;
    for action in [delete_backward_action_id(), delete_forward_action_id()] {
        assert_disabled(&registry, &fragmented, action, "breditor/operation-budget-exceeded")?;
    }
    let selected_state = state(
        &no_operations,
        &[paragraph_value(&[("ab", false)])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(0, 0, 1, Affinity::After)?,
        )),
        None,
        "delete-selection-operation-limit",
    )?;
    assert_disabled(
        &registry,
        &selected_state,
        delete_selection_action_id(),
        "breditor/operation-budget-exceeded",
    )?;

    let leaf_limited = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(2),
    );
    let join = state(
        &leaf_limited,
        &[paragraph_value(&[("aa", false)]), paragraph_value(&[("bb", false)])],
        Some(collapsed(text_point(0, 0, 2, Affinity::After)?)),
        None,
        "delete-forward-result-limit",
    )?;
    assert_disabled(
        &registry,
        &join,
        delete_forward_action_id(),
        "breditor/result-limit-exceeded",
    )?;
    let selection = state(
        &leaf_limited,
        &[paragraph_value(&[("aa", false), ("B", true), ("cc", false)])],
        Some(selected(
            text_point(0, 1, 0, Affinity::Before)?,
            text_point(0, 1, 1, Affinity::After)?,
        )),
        None,
        "delete-selection-result-limit",
    )?;
    for action in [delete_selection_action_id(), delete_forward_action_id()] {
        assert_disabled(&registry, &selection, action, "breditor/result-limit-exceeded")?;
    }
    Ok(())
}
