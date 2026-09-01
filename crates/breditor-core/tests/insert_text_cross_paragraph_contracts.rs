//! Black-box contracts for semantic text insertion across base paragraphs.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionInput, ActionInvocation, ActionPreparation, ActionRegistry,
        ActionStateBatch, ActionStateCatalog, ActionStateDomains, ActionStateId,
        ActionStateOutcome, ActionStateRegistration, ActionStateSource, ActionValue,
        PreparedAction, ResolvedActionState,
        builtins::{
            INSERT_TEXT_HISTORY_GROUP_NAME, base_action_registry, insert_text_action_id,
            insert_text_input_contract,
        },
    },
    codec::DocumentJsonCodec,
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{Operation, RootTextReplace},
    position::{Affinity, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    selection::{RangeSelection, ResolvedSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{HistoryIntent, PendingFormatsUpdate, SelectionUpdate},
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
    selection: Selection,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodec::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(paragraphs))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, Some(selection), None)
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

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn enabled(
    registry: &ActionRegistry,
    state: &EditorState,
    text: &str,
) -> Result<PreparedAction, Box<dyn Error>> {
    match registry.prepare(state, &invocation(text)?)? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => Err(test_error(format!(
            "cross-paragraph insert unexpectedly disabled: {}",
            prepared.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    text: &str,
    expected_code: &str,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(prepared) = registry.prepare(state, &invocation(text)?)? else {
        return Err(test_error(format!("expected disabled reason {expected_code}")).into());
    };
    assert_eq!(prepared.reason().code().as_str(), expected_code);
    assert_eq!(prepared.reason().detail(), None);
    assert_eq!(state, &original);
    Ok(())
}

fn only_root_replace(operations: &[Operation]) -> Result<&RootTextReplace, Box<dyn Error>> {
    let [Operation::RootTextReplace(operation)] = operations else {
        return Err(test_error(format!(
            "expected exactly one root-text replacement, got {operations:?}"
        ))
        .into());
    };
    Ok(operation)
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

fn assert_paragraph_count(document: &Document, expected: usize) -> TestResult {
    let root = document
        .root()
        .as_element()
        .ok_or_else(|| test_error("validated root was not an element"))?;
    assert_eq!(root.children().len(), expected);
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

fn state_id(value: &str) -> Result<ActionStateId, Box<dyn Error>> {
    ActionStateId::try_new(value).map_err(Into::into)
}

fn resolved<'a>(
    batch: &'a ActionStateBatch,
    id: &ActionStateId,
) -> Result<&'a ResolvedActionState, Box<dyn Error>> {
    let entry = batch.entry(id).ok_or_else(|| test_error(format!("missing entry {id}")))?;
    match entry.outcome() {
        ActionStateOutcome::Resolved(outcome) => Ok(outcome),
        other => Err(test_error(format!("entry {id} was not resolved: {other:?}")).into()),
    }
}

#[test]
#[allow(clippy::too_many_lines)]
fn normalized_direction_and_endpoint_aliases_build_one_exact_root_replace() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let paragraphs = [
        paragraph_value(&[("outside-left", false)]),
        paragraph_value(&[("ab", false), ("CD", true)]),
        paragraph_value(&[("middle", false)]),
        paragraph_value(&[("EF", true), ("gh", false)]),
        paragraph_value(&[("outside-right", true)]),
    ];
    let expected_guards = [
        fragment(&[("ab", false), ("CD", true)])?,
        fragment(&[("middle", false)])?,
        fragment(&[("EF", true), ("gh", false)])?,
    ];

    for (affinity_index, (start_affinity, end_affinity)) in
        [(Affinity::Before, Affinity::After), (Affinity::After, Affinity::Before)]
            .into_iter()
            .enumerate()
    {
        let starts = [
            text_point(1, 0, 2, start_affinity)?,
            child_point(1, 1, start_affinity)?,
            text_point(1, 1, 0, start_affinity)?,
        ];
        let ends = [
            text_point(3, 0, 2, end_affinity)?,
            child_point(3, 1, end_affinity)?,
            text_point(3, 1, 0, end_affinity)?,
        ];
        for (start_index, start) in starts.iter().enumerate() {
            for (end_index, end) in ends.iter().enumerate() {
                for backward in [false, true] {
                    let selection = if backward {
                        selected(end.clone(), start.clone())
                    } else {
                        selected(start.clone(), end.clone())
                    };
                    let lineage = format!(
                        "insert-cross-alias-{affinity_index}-{start_index}-{end_index}-{}",
                        u8::from(backward)
                    );
                    let initial = state(&context, &paragraphs, selection, &lineage)?;
                    let prepared = enabled(&registry, &initial, "X")?;
                    let operation = only_root_replace(prepared.transaction().operations())?;
                    assert_eq!(operation.range().start().paragraph_path(), &path(&[1])?);
                    assert_eq!(operation.range().start().offset(), TextOffset::try_new(2)?);
                    assert_eq!(operation.range().end().paragraph_path(), &path(&[3])?);
                    assert_eq!(operation.range().end().offset(), TextOffset::try_new(2)?);
                    assert_eq!(operation.expected_paragraphs(), expected_guards.as_slice());
                    assert_eq!(operation.replacement_paragraphs(), &[fragment(&[("X", true)])?]);
                    assert_eq!(
                        prepared.transaction().selection_update(),
                        &SelectionUpdate::Set(Some(selected(
                            text_point(1, 2, 0, Affinity::Before)?,
                            text_point(1, 2, 0, Affinity::Before)?,
                        )))
                    );
                    assert_eq!(
                        prepared.transaction().pending_formats_update(),
                        &PendingFormatsUpdate::Set(None)
                    );
                    assert_eq!(
                        prepared.transaction().metadata().history(),
                        &HistoryIntent::Merge {
                            group: QualifiedName::try_new(INSERT_TEXT_HISTORY_GROUP_NAME)?,
                        }
                    );

                    let commit = prepared.execute(&initial)?;
                    assert!(matches!(commit.forward_operations(), [Operation::RootTextReplace(_)]));
                    assert_paragraph_count(commit.after().document(), 3)?;
                    assert_paragraph_runs(
                        commit.after().document(),
                        1,
                        &[("ab", false), ("X", true), ("gh", false)],
                    )?;
                    assert_exact_caret(commit.after(), &text_point(1, 2, 0, Affinity::Before)?)?;
                }
            }
        }
    }
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn format_resolution_scans_selected_text_then_left_right_and_plain_fallbacks() -> TestResult {
    struct Case {
        lineage: &'static str,
        paragraphs: Vec<Value>,
        selection: Selection,
        expected_strong: bool,
        expected_runs: Vec<(&'static str, bool)>,
        caret: Point,
    }

    let cases = vec![
        Case {
            lineage: "insert-cross-format-start",
            paragraphs: vec![
                paragraph_value(&[("a", false), ("B", true)]),
                paragraph_value(&[("c", false)]),
            ],
            selection: selected(
                text_point(0, 0, 1, Affinity::After)?,
                text_point(1, 0, 1, Affinity::Before)?,
            ),
            expected_strong: true,
            expected_runs: vec![("a", false), ("X", true)],
            caret: text_point(0, 1, 1, Affinity::Before)?,
        },
        Case {
            lineage: "insert-cross-format-middle",
            paragraphs: vec![
                paragraph_value(&[("a", false)]),
                paragraph_value(&[("M", true)]),
                paragraph_value(&[("z", false)]),
            ],
            selection: selected(
                text_point(2, 0, 0, Affinity::Before)?,
                text_point(0, 0, 1, Affinity::After)?,
            ),
            expected_strong: true,
            expected_runs: vec![("a", false), ("X", true), ("z", false)],
            caret: text_point(0, 2, 0, Affinity::Before)?,
        },
        Case {
            lineage: "insert-cross-format-end",
            paragraphs: vec![
                paragraph_value(&[("a", false)]),
                paragraph_value(&[]),
                paragraph_value(&[("E", true), ("f", false)]),
            ],
            selection: selected(
                text_point(0, 0, 1, Affinity::Before)?,
                text_point(2, 0, 1, Affinity::After)?,
            ),
            expected_strong: true,
            expected_runs: vec![("a", false), ("X", true), ("f", false)],
            caret: text_point(0, 2, 0, Affinity::Before)?,
        },
        Case {
            lineage: "insert-cross-format-left-fallback",
            paragraphs: vec![paragraph_value(&[("L", true)]), paragraph_value(&[("r", false)])],
            selection: selected(
                text_point(1, 0, 0, Affinity::After)?,
                text_point(0, 0, 1, Affinity::Before)?,
            ),
            expected_strong: true,
            expected_runs: vec![("LX", true), ("r", false)],
            caret: text_point(0, 1, 0, Affinity::Before)?,
        },
        Case {
            lineage: "insert-cross-format-right-fallback",
            paragraphs: vec![paragraph_value(&[]), paragraph_value(&[("R", true)])],
            selection: selected(
                child_point(0, 0, Affinity::Before)?,
                text_point(1, 0, 0, Affinity::After)?,
            ),
            expected_strong: true,
            expected_runs: vec![("XR", true)],
            caret: text_point(0, 0, 1, Affinity::Before)?,
        },
        Case {
            lineage: "insert-cross-format-plain-fallback",
            paragraphs: vec![paragraph_value(&[]), paragraph_value(&[])],
            selection: selected(
                child_point(1, 0, Affinity::After)?,
                child_point(0, 0, Affinity::Before)?,
            ),
            expected_strong: false,
            expected_runs: vec![("X", false)],
            caret: text_point(0, 0, 1, Affinity::Before)?,
        },
    ];

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for case in cases {
        let initial = state(&context, &case.paragraphs, case.selection, case.lineage)?;
        let prepared = enabled(&registry, &initial, "X")?;
        let operation = only_root_replace(prepared.transaction().operations())?;
        assert_eq!(
            operation.replacement_paragraphs(),
            &[fragment(&[("X", case.expected_strong)])?]
        );
        let commit = prepared.execute(&initial)?;
        assert_paragraph_count(commit.after().document(), 1)?;
        assert_paragraph_runs(commit.after().document(), 0, &case.expected_runs)?;
        assert_exact_caret(commit.after(), &case.caret)?;
    }
    Ok(())
}

#[test]
fn empty_nonzero_unicode_input_and_equal_format_seams_remain_exact() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let exact = "😀\ne\u{301}";
    let initial = state(
        &context,
        &[
            paragraph_value(&[("outside", true)]),
            paragraph_value(&[]),
            paragraph_value(&[]),
            paragraph_value(&[("tail", false)]),
        ],
        selected(child_point(2, 0, Affinity::After)?, child_point(1, 0, Affinity::Before)?),
        "insert-cross-empty-unicode-nonzero",
    )?;
    let commit = enabled(&registry, &initial, exact)?.execute(&initial)?;
    assert_paragraph_count(commit.after().document(), 3)?;
    assert_paragraph_runs(commit.after().document(), 1, &[(exact, false)])?;
    assert_exact_caret(commit.after(), &text_point(1, 0, 5, Affinity::Before)?)?;

    let seam = state(
        &context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("b", false)])],
        selected(text_point(0, 0, 1, Affinity::After)?, text_point(1, 0, 0, Affinity::Before)?),
        "insert-cross-unicode-canonical-seam",
    )?;
    let seam_commit = enabled(&registry, &seam, exact)?.execute(&seam)?;
    let combined = format!("a{exact}b");
    assert_paragraph_runs(seam_commit.after().document(), 0, &[(combined.as_str(), false)])?;
    assert_exact_caret(seam_commit.after(), &text_point(0, 0, 6, Affinity::Before)?)?;
    let text = seam_commit
        .after()
        .document()
        .node_at(&path(&[0, 0])?)?
        .as_text()
        .ok_or_else(|| test_error("canonical Unicode result was not text"))?;
    assert_eq!(text.text(), combined);
    assert_ne!(text.text(), "a😀\néb");
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn proactive_cross_result_limits_accept_exact_boundaries_and_disable_reachable_overflow()
-> TestResult {
    let registry = base_action_registry()?;

    let leaf_exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(3),
    );
    let leaf_selection =
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(1, 0, 0, Affinity::After)?);
    let leaf_exact = state(
        &leaf_exact_context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("b", false)])],
        leaf_selection.clone(),
        "insert-cross-leaf-exact",
    )?;
    let leaf_commit = enabled(&registry, &leaf_exact, "X")?.execute(&leaf_exact)?;
    assert_paragraph_runs(leaf_commit.after().document(), 0, &[("aXb", false)])?;
    let leaf_over_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(2),
    );
    let leaf_over = state(
        &leaf_over_context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("b", false)])],
        leaf_selection,
        "insert-cross-leaf-over",
    )?;
    assert_disabled(&registry, &leaf_over, "X", "breditor/result-limit-exceeded")?;

    let child_selection =
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(1, 0, 1, Affinity::After)?);
    let child_paragraphs = [
        paragraph_value(&[("a", false), ("B", true)]),
        paragraph_value(&[("C", true), ("b", false)]),
    ];
    let child_exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(3),
    );
    let child_exact = state(
        &child_exact_context,
        &child_paragraphs,
        child_selection.clone(),
        "insert-cross-child-exact",
    )?;
    let child_commit = enabled(&registry, &child_exact, "X")?.execute(&child_exact)?;
    assert_paragraph_runs(
        child_commit.after().document(),
        0,
        &[("a", false), ("X", true), ("b", false)],
    )?;
    let child_over_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(2),
    );
    let child_over =
        state(&child_over_context, &child_paragraphs, child_selection, "insert-cross-child-over")?;
    assert_disabled(&registry, &child_over, "X", "breditor/result-limit-exceeded")?;

    let total_selection =
        selected(text_point(1, 0, 1, Affinity::Before)?, text_point(2, 0, 0, Affinity::After)?);
    let total_paragraphs = [
        paragraph_value(&[("zz", false)]),
        paragraph_value(&[("a", false)]),
        paragraph_value(&[("b", false)]),
    ];
    let total_exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(5),
    );
    let total_exact = state(
        &total_exact_context,
        &total_paragraphs,
        total_selection.clone(),
        "insert-cross-total-exact",
    )?;
    let total_commit = enabled(&registry, &total_exact, "X")?.execute(&total_exact)?;
    assert_eq!(total_commit.after().document().summary().total_text_bytes(), 5);
    let total_over_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(4),
    );
    let total_over =
        state(&total_over_context, &total_paragraphs, total_selection, "insert-cross-total-over")?;
    assert_disabled(&registry, &total_over, "X", "breditor/result-limit-exceeded")?;

    // One cross-paragraph insert replaces N >= 2 paragraphs with one. Root
    // child count strictly decreases and node count cannot increase, so no
    // result-only root/node overflow is reachable from a valid base. Exercise
    // both exact source limits and an exact final node limit instead.
    let monotonic_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(2).with_max_nodes(3),
    );
    let monotonic = state(
        &monotonic_context,
        &[paragraph_value(&[]), paragraph_value(&[])],
        selected(child_point(0, 0, Affinity::Before)?, child_point(1, 0, Affinity::After)?),
        "insert-cross-root-node-monotonic",
    )?;
    assert_eq!(monotonic.document().summary().node_count(), 3);
    assert_paragraph_count(monotonic.document(), 2)?;
    let monotonic_commit = enabled(&registry, &monotonic, "X")?.execute(&monotonic)?;
    assert_eq!(monotonic_commit.after().document().summary().node_count(), 3);
    assert_paragraph_count(monotonic_commit.after().document(), 1)?;

    let budget_context = EditorContext::default().with_max_operations_per_transaction(0);
    let budget = state(
        &budget_context,
        &[paragraph_value(&[]), paragraph_value(&[])],
        selected(child_point(0, 0, Affinity::Before)?, child_point(1, 0, Affinity::After)?),
        "insert-cross-operation-budget",
    )?;
    assert_disabled(&registry, &budget, "X", "breditor/operation-budget-exceeded")?;
    Ok(())
}

#[test]
fn fixed_cross_paragraph_catalog_entry_is_enabled_without_mutating_session() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("b", false)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(1, 0, 0, Affinity::After)?),
        "insert-cross-action-state",
    )?;
    let initial_copy = initial.clone();
    let session = EditorSession::new(initial);
    let id = state_id("breditor/cross-snippet")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![ActionStateRegistration::new(id.clone(), ActionStateSource::direct(invocation("X")?))],
    )?;
    let batch = catalog.derive(&session)?;
    let outcome = resolved(&batch, &id)?;
    assert!(outcome.availability().is_enabled());
    assert_eq!(outcome.indicator().activation(), ActionActivation::Stateless);
    assert_eq!(
        outcome.actual_writes(),
        Some(
            ActionStateDomains::DOCUMENT
                | ActionStateDomains::SELECTION
                | ActionStateDomains::HISTORY
                | ActionStateDomains::SNAPSHOT
        )
    );
    assert_eq!(session.state(), &initial_copy);
    let prepared = enabled(catalog.action_registry(), session.state(), "X")?;
    assert!(matches!(prepared.transaction().operations(), [Operation::RootTextReplace(_)]));
    Ok(())
}

#[test]
fn cross_then_adjacent_typing_merges_and_undo_redo_restore_directional_selection() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial_selection =
        selected(text_point(2, 0, 2, Affinity::After)?, text_point(0, 0, 2, Affinity::Before)?);
    let initial = state(
        &context,
        &[
            paragraph_value(&[("ab", false), ("CD", true)]),
            paragraph_value(&[("middle", false)]),
            paragraph_value(&[("EF", true), ("gh", false)]),
        ],
        initial_selection.clone(),
        "insert-cross-merged-history",
    )?;
    let initial_copy = initial.clone();
    let mut session = EditorSession::new(initial);

    let first = registry.prepare(session.state(), &invocation("X")?)?;
    let first_commit = session.execute_prepared_action(first)?;
    assert!(matches!(first_commit.forward_operations(), [Operation::RootTextReplace(_)]));
    assert_paragraph_runs(
        session.state().document(),
        0,
        &[("ab", false), ("X", true), ("gh", false)],
    )?;
    assert_exact_caret(session.state(), &text_point(0, 2, 0, Affinity::Before)?)?;

    let second = registry.prepare(session.state(), &invocation("😀")?)?;
    let second_commit = session.execute_prepared_action(second)?;
    assert!(matches!(second_commit.forward_operations(), [Operation::TextSplice(_)]));
    assert_paragraph_runs(
        session.state().document(),
        0,
        &[("ab", false), ("X😀", true), ("gh", false)],
    )?;
    assert_exact_caret(session.state(), &text_point(0, 2, 0, Affinity::Before)?)?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    let after_merged = session.state().clone();

    let Some(undo) = session.undo()? else {
        return Err(test_error("merged cross-paragraph typing was not undoable").into());
    };
    assert_eq!(undo.after().document(), initial_copy.document());
    assert_eq!(undo.after().selection(), Some(&initial_selection));
    assert_eq!(undo.after().pending_formats(), initial_copy.pending_formats());
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let Some(redo) = session.redo()? else {
        return Err(test_error("merged cross-paragraph typing was not redoable").into());
    };
    assert_eq!(redo.after().document(), after_merged.document());
    assert_eq!(redo.after().selection(), after_merged.selection());
    assert_eq!(redo.after().pending_formats(), after_merged.pending_formats());
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    Ok(())
}
