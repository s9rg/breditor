//! Black-box contracts for semantic paragraph breaks across base paragraphs.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionInput, ActionInvocation, ActionPreparation, ActionRegistry,
        ActionStateBatch, ActionStateCatalog, ActionStateDomains, ActionStateId,
        ActionStateOutcome, ActionStateRegistration, ActionStateSource, ActionValue,
        PreparedAction, ResolvedActionState,
        builtins::{
            base_action_registry, insert_paragraph_break_action_id, insert_text_action_id,
            insert_text_input_contract,
        },
    },
    codec::DocumentJsonCodec,
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{DeletedPointPolicy, Operation, RootTextReplace, SelectionRelocationPolicy},
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

fn enter_invocation() -> ActionInvocation {
    ActionInvocation::without_input(insert_paragraph_break_action_id())
}

fn insert_invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn enabled_enter(
    registry: &ActionRegistry,
    state: &EditorState,
) -> Result<PreparedAction, Box<dyn Error>> {
    match registry.prepare(state, &enter_invocation())? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => Err(test_error(format!(
            "cross-paragraph break unexpectedly disabled: {}",
            prepared.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    expected_code: &str,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(prepared) = registry.prepare(state, &enter_invocation())?
    else {
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
fn normalized_direction_affinity_and_endpoint_aliases_build_one_exact_root_replace() -> TestResult {
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

    for start_affinity in [Affinity::Before, Affinity::After] {
        for end_affinity in [Affinity::Before, Affinity::After] {
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
                            "enter-cross-alias-{}-{}-{start_index}-{end_index}-{}",
                            u8::from(matches!(start_affinity, Affinity::After)),
                            u8::from(matches!(end_affinity, Affinity::After)),
                            u8::from(backward)
                        );
                        let initial = state(&context, &paragraphs, selection, &lineage)?;
                        let prepared = enabled_enter(&registry, &initial)?;
                        let transaction = prepared.transaction();
                        let operation = only_root_replace(transaction.operations())?;
                        assert_eq!(operation.range().start().paragraph_path(), &path(&[1])?);
                        assert_eq!(operation.range().start().offset(), TextOffset::try_new(2)?);
                        assert_eq!(operation.range().end().paragraph_path(), &path(&[3])?);
                        assert_eq!(operation.range().end().offset(), TextOffset::try_new(2)?);
                        assert_eq!(operation.expected_paragraphs(), expected_guards.as_slice());
                        assert_eq!(
                            operation.replacement_paragraphs(),
                            &[TextFragment::empty(), TextFragment::empty()]
                        );
                        assert_eq!(
                            transaction.selection_relocation(),
                            SelectionRelocationPolicy::new(
                                DeletedPointPolicy::Reject,
                                DeletedPointPolicy::Reject,
                            )
                        );
                        assert_eq!(
                            transaction.selection_update(),
                            &SelectionUpdate::Set(Some(selected(
                                child_point(2, 0, Affinity::After)?,
                                child_point(2, 0, Affinity::After)?,
                            )))
                        );
                        assert_eq!(
                            transaction.pending_formats_update(),
                            &PendingFormatsUpdate::Set(None)
                        );
                        assert_eq!(transaction.metadata().history(), &HistoryIntent::Record);

                        let commit = prepared.execute(&initial)?;
                        assert!(matches!(
                            commit.forward_operations(),
                            [Operation::RootTextReplace(_)]
                        ));
                        assert!(matches!(
                            commit.inverse_operations(),
                            [Operation::RootTextReplace(_)]
                        ));
                        assert_paragraph_count(commit.after().document(), 4)?;
                        assert_paragraph_runs(
                            commit.after().document(),
                            0,
                            &[("outside-left", false)],
                        )?;
                        assert_paragraph_runs(commit.after().document(), 1, &[("ab", false)])?;
                        assert_paragraph_runs(commit.after().document(), 2, &[("gh", false)])?;
                        assert_paragraph_runs(
                            commit.after().document(),
                            3,
                            &[("outside-right", true)],
                        )?;
                        assert_exact_caret(commit.after(), &child_point(2, 0, Affinity::After)?)?;
                        assert_eq!(commit.after().pending_formats(), None);
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn structural_only_two_paragraph_break_is_state_only_and_not_a_new_undo_entry() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("B", true)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(1, 0, 0, Affinity::After)?),
        "enter-cross-structural-state-only",
    )?;
    let original_document = initial.document().clone();
    let prepared = enabled_enter(&registry, &initial)?;
    assert_eq!(prepared.transaction().operations().len(), 1);
    assert_eq!(
        prepared.actual_writes(),
        ActionStateDomains::SELECTION | ActionStateDomains::HISTORY | ActionStateDomains::SNAPSHOT
    );
    let mut session = EditorSession::new(initial);
    let commit = session.execute_prepared_action(ActionPreparation::Enabled(prepared))?;
    assert!(commit.forward_operations().is_empty());
    assert!(commit.inverse_operations().is_empty());
    assert_eq!(commit.after().document(), &original_document);
    assert_paragraph_runs(commit.after().document(), 0, &[("a", false)])?;
    assert_paragraph_runs(commit.after().document(), 1, &[("B", true)])?;
    assert_exact_caret(commit.after(), &child_point(1, 0, Affinity::After)?)?;
    assert_eq!(session.undo_depth(), 0);
    assert!(session.undo()?.is_none());
    Ok(())
}

#[test]
fn empty_nonzero_and_non_bmp_spans_preserve_two_exact_result_paragraphs() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();

    let empty = state(
        &context,
        &[
            paragraph_value(&[("outside-left", false)]),
            paragraph_value(&[]),
            paragraph_value(&[]),
            paragraph_value(&[]),
            paragraph_value(&[("outside-right", true)]),
        ],
        selected(child_point(3, 0, Affinity::After)?, child_point(1, 0, Affinity::Before)?),
        "enter-cross-empty-nonzero",
    )?;
    let empty_commit = enabled_enter(&registry, &empty)?.execute(&empty)?;
    assert_paragraph_count(empty_commit.after().document(), 4)?;
    assert_paragraph_runs(empty_commit.after().document(), 0, &[("outside-left", false)])?;
    assert_paragraph_runs(empty_commit.after().document(), 1, &[])?;
    assert_paragraph_runs(empty_commit.after().document(), 2, &[])?;
    assert_paragraph_runs(empty_commit.after().document(), 3, &[("outside-right", true)])?;
    assert_exact_caret(empty_commit.after(), &child_point(2, 0, Affinity::After)?)?;

    let unicode = state(
        &context,
        &[
            paragraph_value(&[("outside-left", true)]),
            paragraph_value(&[("a😀x", false)]),
            paragraph_value(&[("middle", true)]),
            paragraph_value(&[("q😀b", false)]),
            paragraph_value(&[("outside-right", true)]),
        ],
        selected(text_point(3, 0, 3, Affinity::After)?, text_point(1, 0, 3, Affinity::Before)?),
        "enter-cross-non-bmp-nonzero",
    )?;
    let prepared = enabled_enter(&registry, &unicode)?;
    let operation = only_root_replace(prepared.transaction().operations())?;
    assert_eq!(operation.range().start().offset(), TextOffset::try_new(3)?);
    assert_eq!(operation.range().end().offset(), TextOffset::try_new(3)?);
    let unicode_commit = prepared.execute(&unicode)?;
    assert_paragraph_count(unicode_commit.after().document(), 4)?;
    assert_paragraph_runs(unicode_commit.after().document(), 1, &[("a😀", false)])?;
    assert_paragraph_runs(unicode_commit.after().document(), 2, &[("b", false)])?;
    assert_exact_caret(unicode_commit.after(), &child_point(2, 0, Affinity::After)?)?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn tight_monotone_limits_and_one_operation_budget_need_no_intermediate_tree() -> TestResult {
    let registry = base_action_registry()?;

    // Replacing N >= 2 paragraphs with exactly two cannot increase root
    // children, global nodes, total bytes, paragraph children, leaf bytes, or
    // format count. Exercise every final limit at an exact valid boundary.
    let exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default()
            .with_max_children_per_element(3)
            .with_max_nodes(10)
            .with_max_text_bytes(1)
            .with_max_total_text_bytes(6),
    )
    .with_max_operations_per_transaction(1);
    let exact = state(
        &exact_context,
        &[
            paragraph_value(&[("a", false), ("B", true), ("c", false)]),
            paragraph_value(&[]),
            paragraph_value(&[("D", true), ("e", false), ("F", true)]),
        ],
        selected(text_point(0, 2, 1, Affinity::Before)?, text_point(2, 0, 0, Affinity::After)?),
        "enter-cross-all-limits-exact",
    )?;
    assert_eq!(exact.document().summary().node_count(), 10);
    assert_eq!(exact.document().summary().total_text_bytes(), 6);
    let exact_commit = enabled_enter(&registry, &exact)?.execute(&exact)?;
    assert_paragraph_count(exact_commit.after().document(), 2)?;
    assert_eq!(exact_commit.after().document().summary().node_count(), 9);
    assert_eq!(exact_commit.after().document().summary().total_text_bytes(), 6);
    assert_paragraph_runs(
        exact_commit.after().document(),
        0,
        &[("a", false), ("B", true), ("c", false)],
    )?;
    assert_paragraph_runs(
        exact_commit.after().document(),
        1,
        &[("D", true), ("e", false), ("F", true)],
    )?;

    // A join/delete intermediate would coalesce `aa` and `bb` into an
    // over-limit four-byte leaf. The atomic two-fragment result never joins
    // those paragraphs and therefore succeeds without an intermediate limit.
    let atomic_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(3).with_max_text_bytes(2),
    )
    .with_max_operations_per_transaction(1);
    let atomic_paragraphs = [
        paragraph_value(&[("aa", false), ("X", true)]),
        paragraph_value(&[]),
        paragraph_value(&[("Y", true), ("bb", false)]),
    ];
    let atomic_selection =
        selected(text_point(0, 0, 2, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?);
    let atomic = state(
        &atomic_context,
        &atomic_paragraphs,
        atomic_selection.clone(),
        "enter-cross-no-intermediate",
    )?;
    let atomic_prepared = enabled_enter(&registry, &atomic)?;
    assert_eq!(atomic_prepared.transaction().operations().len(), 1);
    let atomic_commit = atomic_prepared.execute(&atomic)?;
    assert_paragraph_runs(atomic_commit.after().document(), 0, &[("aa", false)])?;
    assert_paragraph_runs(atomic_commit.after().document(), 1, &[("bb", false)])?;

    let budget_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(3).with_max_text_bytes(2),
    )
    .with_max_operations_per_transaction(0);
    let budget = state(
        &budget_context,
        &atomic_paragraphs,
        atomic_selection,
        "enter-cross-operation-budget",
    )?;
    assert_disabled(&registry, &budget, "breditor/operation-budget-exceeded")?;
    Ok(())
}

#[test]
fn catalog_reports_changed_state_only_and_disabled_cross_sources_purely() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let changed = state(
        &context,
        &[
            paragraph_value(&[("ab", false)]),
            paragraph_value(&[("middle", true)]),
            paragraph_value(&[("CD", true)]),
        ],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?),
        "enter-cross-catalog-changed",
    )?;
    let changed_copy = changed.clone();
    let changed_session = EditorSession::new(changed);
    let changed_id = state_id("breditor/enter-cross-changed")?;
    let changed_catalog = ActionStateCatalog::try_new(
        registry,
        vec![ActionStateRegistration::new(
            changed_id.clone(),
            ActionStateSource::direct(enter_invocation()),
        )],
    )?;
    let changed_batch = changed_catalog.derive(&changed_session)?;
    let changed_outcome = resolved(&changed_batch, &changed_id)?;
    assert!(changed_outcome.availability().is_enabled());
    assert_eq!(changed_outcome.indicator().activation(), ActionActivation::Stateless);
    assert_eq!(
        changed_outcome.actual_writes(),
        Some(
            ActionStateDomains::DOCUMENT
                | ActionStateDomains::SELECTION
                | ActionStateDomains::HISTORY
                | ActionStateDomains::SNAPSHOT,
        )
    );
    assert_eq!(changed_session.state(), &changed_copy);

    let state_only = state(
        &context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("B", true)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(1, 0, 0, Affinity::After)?),
        "enter-cross-catalog-state-only",
    )?;
    let state_only_copy = state_only.clone();
    let state_only_session = EditorSession::new(state_only);
    let state_only_id = state_id("breditor/enter-cross-state-only")?;
    let state_only_catalog = ActionStateCatalog::try_new(
        base_action_registry()?,
        vec![ActionStateRegistration::new(
            state_only_id.clone(),
            ActionStateSource::direct(enter_invocation()),
        )],
    )?;
    let state_only_batch = state_only_catalog.derive(&state_only_session)?;
    assert_eq!(
        resolved(&state_only_batch, &state_only_id)?.actual_writes(),
        Some(
            ActionStateDomains::SELECTION
                | ActionStateDomains::HISTORY
                | ActionStateDomains::SNAPSHOT,
        )
    );
    assert_eq!(state_only_session.state(), &state_only_copy);

    let budget_context = EditorContext::default().with_max_operations_per_transaction(0);
    let disabled = state(
        &budget_context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[]), paragraph_value(&[("B", true)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(2, 0, 0, Affinity::After)?),
        "enter-cross-catalog-disabled",
    )?;
    let disabled_copy = disabled.clone();
    let disabled_session = EditorSession::new(disabled);
    let disabled_id = state_id("breditor/enter-cross-disabled")?;
    let disabled_catalog = ActionStateCatalog::try_new(
        base_action_registry()?,
        vec![ActionStateRegistration::new(
            disabled_id.clone(),
            ActionStateSource::direct(enter_invocation()),
        )],
    )?;
    let disabled_batch = disabled_catalog.derive(&disabled_session)?;
    let disabled_outcome = resolved(&disabled_batch, &disabled_id)?;
    assert_eq!(
        disabled_outcome.availability().reason().map(|reason| reason.code().as_str()),
        Some("breditor/operation-budget-exceeded")
    );
    assert_eq!(disabled_outcome.actual_writes(), None);
    assert_eq!(disabled_session.state(), &disabled_copy);
    Ok(())
}

#[test]
fn cross_break_undo_redo_restores_exact_direction_document_and_pending_state() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial_selection =
        selected(text_point(2, 0, 1, Affinity::After)?, text_point(0, 0, 1, Affinity::Before)?);
    let initial = state(
        &context,
        &[
            paragraph_value(&[("ab", false)]),
            paragraph_value(&[("middle", true)]),
            paragraph_value(&[("CD", true)]),
        ],
        initial_selection.clone(),
        "enter-cross-history",
    )?;
    let initial_copy = initial.clone();
    let mut session = EditorSession::new(initial);
    let prepared = registry.prepare(session.state(), &enter_invocation())?;
    let commit = session.execute_prepared_action(prepared)?;
    assert!(matches!(commit.forward_operations(), [Operation::RootTextReplace(_)]));
    assert!(matches!(commit.inverse_operations(), [Operation::RootTextReplace(_)]));
    assert_paragraph_runs(session.state().document(), 0, &[("a", false)])?;
    assert_paragraph_runs(session.state().document(), 1, &[("D", true)])?;
    assert_exact_caret(session.state(), &child_point(1, 0, Affinity::After)?)?;
    assert_eq!(session.state().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    let result = session.state().clone();

    let Some(undo) = session.undo()? else {
        return Err(test_error("cross-paragraph break was not undoable").into());
    };
    assert!(matches!(undo.forward_operations(), [Operation::RootTextReplace(_)]));
    assert_eq!(undo.after().document(), initial_copy.document());
    assert_eq!(undo.after().selection(), Some(&initial_selection));
    assert_eq!(undo.after().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let Some(redo) = session.redo()? else {
        return Err(test_error("cross-paragraph break was not redoable").into());
    };
    assert!(matches!(redo.forward_operations(), [Operation::RootTextReplace(_)]));
    assert_eq!(redo.after().document(), result.document());
    assert_eq!(redo.after().selection(), result.selection());
    assert_eq!(redo.after().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    Ok(())
}

#[test]
fn right_child_after_caret_inherits_suffix_format_and_stays_a_separate_history_event() -> TestResult
{
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial_selection =
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(2, 0, 0, Affinity::After)?);
    let initial = state(
        &context,
        &[
            paragraph_value(&[("a", false)]),
            paragraph_value(&[("middle", false)]),
            paragraph_value(&[("B", true)]),
        ],
        initial_selection.clone(),
        "enter-cross-insert-interoperability",
    )?;
    let initial_copy = initial.clone();
    let mut session = EditorSession::new(initial);

    let enter = registry.prepare(session.state(), &enter_invocation())?;
    session.execute_prepared_action(enter)?;
    assert_paragraph_runs(session.state().document(), 0, &[("a", false)])?;
    assert_paragraph_runs(session.state().document(), 1, &[("B", true)])?;
    assert_exact_caret(session.state(), &child_point(1, 0, Affinity::After)?)?;
    let after_enter = session.state().clone();
    assert_eq!(session.undo_depth(), 1);

    let insert = registry.prepare(session.state(), &insert_invocation("X")?)?;
    session.execute_prepared_action(insert)?;
    assert_paragraph_runs(session.state().document(), 1, &[("XB", true)])?;
    assert_eq!(session.undo_depth(), 2);

    let Some(undo_insert) = session.undo()? else {
        return Err(test_error("post-break insertion was not undoable").into());
    };
    assert_eq!(undo_insert.after().document(), after_enter.document());
    assert_eq!(undo_insert.after().selection(), after_enter.selection());
    let Some(undo_enter) = session.undo()? else {
        return Err(test_error("cross-paragraph break was not independently undoable").into());
    };
    assert_eq!(undo_enter.after().document(), initial_copy.document());
    assert_eq!(undo_enter.after().selection(), Some(&initial_selection));
    assert_eq!(undo_enter.after().pending_formats(), None);
    Ok(())
}
