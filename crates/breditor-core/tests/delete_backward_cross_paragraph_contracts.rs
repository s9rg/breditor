//! Black-box contracts for semantic backward deletion across base paragraphs.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionInput, ActionInvocation, ActionPreparation, ActionRegistry,
        ActionStateBatch, ActionStateCatalog, ActionStateDomains, ActionStateId,
        ActionStateOutcome, ActionStateRegistration, ActionStateSource, ActionValue,
        PreparedAction, ResolvedActionState,
        builtins::{
            base_action_registry, delete_backward_action_id, insert_text_action_id,
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

fn delete_invocation() -> ActionInvocation {
    ActionInvocation::without_input(delete_backward_action_id())
}

fn insert_invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_text_action_id(),
        ActionInput::typed(insert_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn enabled_delete(
    registry: &ActionRegistry,
    state: &EditorState,
) -> Result<PreparedAction, Box<dyn Error>> {
    match registry.prepare(state, &delete_invocation())? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => Err(test_error(format!(
            "cross-paragraph delete unexpectedly disabled: {}",
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
    let ActionPreparation::Disabled(prepared) = registry.prepare(state, &delete_invocation())?
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
                            "delete-cross-alias-{}-{}-{start_index}-{end_index}-{}",
                            u8::from(matches!(start_affinity, Affinity::After)),
                            u8::from(matches!(end_affinity, Affinity::After)),
                            u8::from(backward)
                        );
                        let initial = state(&context, &paragraphs, selection, &lineage)?;
                        let prepared = enabled_delete(&registry, &initial)?;
                        let transaction = prepared.transaction();
                        let operation = only_root_replace(transaction.operations())?;
                        assert_eq!(operation.range().start().paragraph_path(), &path(&[1])?);
                        assert_eq!(operation.range().start().offset(), TextOffset::try_new(2)?);
                        assert_eq!(operation.range().end().paragraph_path(), &path(&[3])?);
                        assert_eq!(operation.range().end().offset(), TextOffset::try_new(2)?);
                        assert_eq!(operation.expected_paragraphs(), expected_guards.as_slice());
                        assert_eq!(operation.replacement_paragraphs(), &[TextFragment::empty()]);
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
                                text_point(1, 0, 2, Affinity::After)?,
                                text_point(1, 0, 2, Affinity::After)?,
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
                        assert_paragraph_count(commit.after().document(), 3)?;
                        assert_paragraph_runs(
                            commit.after().document(),
                            0,
                            &[("outside-left", false)],
                        )?;
                        assert_paragraph_runs(commit.after().document(), 1, &[("abgh", false)])?;
                        assert_paragraph_runs(
                            commit.after().document(),
                            2,
                            &[("outside-right", true)],
                        )?;
                        assert_exact_caret(commit.after(), &text_point(1, 0, 2, Affinity::After)?)?;
                        assert_eq!(commit.after().pending_formats(), None);
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn structural_only_equal_unequal_and_empty_seams_are_canonical() -> TestResult {
    struct Case {
        lineage: &'static str,
        left: Vec<(&'static str, bool)>,
        right: Vec<(&'static str, bool)>,
        start: Point,
        end: Point,
        expected: Vec<(&'static str, bool)>,
        caret: Point,
    }

    let cases = vec![
        Case {
            lineage: "delete-cross-equal-seam",
            left: vec![("a", false)],
            right: vec![("b", false)],
            start: text_point(0, 0, 1, Affinity::Before)?,
            end: text_point(1, 0, 0, Affinity::After)?,
            expected: vec![("ab", false)],
            caret: text_point(0, 0, 1, Affinity::After)?,
        },
        Case {
            lineage: "delete-cross-unequal-seam",
            left: vec![("a", false)],
            right: vec![("B", true)],
            start: text_point(0, 0, 1, Affinity::After)?,
            end: text_point(1, 0, 0, Affinity::Before)?,
            expected: vec![("a", false), ("B", true)],
            caret: text_point(0, 1, 0, Affinity::After)?,
        },
        Case {
            lineage: "delete-cross-empty-left",
            left: vec![],
            right: vec![("B", true)],
            start: child_point(0, 0, Affinity::Before)?,
            end: text_point(1, 0, 0, Affinity::After)?,
            expected: vec![("B", true)],
            caret: text_point(0, 0, 0, Affinity::After)?,
        },
        Case {
            lineage: "delete-cross-empty-right",
            left: vec![("a", false)],
            right: vec![],
            start: text_point(0, 0, 1, Affinity::After)?,
            end: child_point(1, 0, Affinity::Before)?,
            expected: vec![("a", false)],
            caret: text_point(0, 0, 1, Affinity::After)?,
        },
        Case {
            lineage: "delete-cross-both-empty",
            left: vec![],
            right: vec![],
            start: child_point(0, 0, Affinity::After)?,
            end: child_point(1, 0, Affinity::Before)?,
            expected: vec![],
            caret: child_point(0, 0, Affinity::After)?,
        },
    ];

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for case in cases {
        let initial = state(
            &context,
            &[paragraph_value(&case.left), paragraph_value(&case.right)],
            selected(case.start, case.end),
            case.lineage,
        )?;
        let commit = enabled_delete(&registry, &initial)?.execute(&initial)?;
        assert!(matches!(commit.forward_operations(), [Operation::RootTextReplace(_)]));
        assert_paragraph_count(commit.after().document(), 1)?;
        assert_paragraph_runs(commit.after().document(), 0, &case.expected)?;
        assert_exact_caret(commit.after(), &case.caret)?;
        assert_eq!(commit.after().pending_formats(), None);
    }
    Ok(())
}

#[test]
fn after_caret_at_an_unequal_seam_makes_insert_text_inherit_the_right_format() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("B", true)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(1, 0, 0, Affinity::After)?),
        "delete-cross-after-format-interoperability",
    )?;
    let mut session = EditorSession::new(initial);
    let delete = registry.prepare(session.state(), &delete_invocation())?;
    session.execute_prepared_action(delete)?;
    assert_exact_caret(session.state(), &text_point(0, 1, 0, Affinity::After)?)?;

    let insert = registry.prepare(session.state(), &insert_invocation("X")?)?;
    session.execute_prepared_action(insert)?;
    assert_paragraph_runs(session.state().document(), 0, &[("a", false), ("XB", true)])?;
    Ok(())
}

#[test]
fn empty_nonzero_and_non_bmp_boundaries_preserve_exact_root_coordinates() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();

    let empty = state(
        &context,
        &[
            paragraph_value(&[("outside-left", false)]),
            paragraph_value(&[]),
            paragraph_value(&[]),
            paragraph_value(&[("outside-right", true)]),
        ],
        selected(child_point(2, 0, Affinity::After)?, child_point(1, 0, Affinity::Before)?),
        "delete-cross-empty-nonzero",
    )?;
    let empty_commit = enabled_delete(&registry, &empty)?.execute(&empty)?;
    assert_paragraph_count(empty_commit.after().document(), 3)?;
    assert_paragraph_runs(empty_commit.after().document(), 0, &[("outside-left", false)])?;
    assert_paragraph_runs(empty_commit.after().document(), 1, &[])?;
    assert_paragraph_runs(empty_commit.after().document(), 2, &[("outside-right", true)])?;
    assert_exact_caret(empty_commit.after(), &child_point(1, 0, Affinity::After)?)?;

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
        "delete-cross-non-bmp-nonzero",
    )?;
    let prepared = enabled_delete(&registry, &unicode)?;
    let operation = only_root_replace(prepared.transaction().operations())?;
    assert_eq!(operation.range().start().offset(), TextOffset::try_new(3)?);
    assert_eq!(operation.range().end().offset(), TextOffset::try_new(3)?);
    let unicode_commit = prepared.execute(&unicode)?;
    assert_paragraph_count(unicode_commit.after().document(), 3)?;
    assert_paragraph_runs(unicode_commit.after().document(), 1, &[("a😀b", false)])?;
    assert_exact_caret(unicode_commit.after(), &text_point(1, 0, 3, Affinity::After)?)?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn proactive_limits_accept_exact_monotonic_boundaries_and_disable_reachable_overflow() -> TestResult
{
    let registry = base_action_registry()?;
    let structural_selection =
        selected(text_point(0, 0, 2, Affinity::Before)?, text_point(1, 0, 0, Affinity::After)?);
    let leaf_paragraphs = [paragraph_value(&[("aa", false)]), paragraph_value(&[("bb", false)])];

    let leaf_exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(4),
    );
    let leaf_exact = state(
        &leaf_exact_context,
        &leaf_paragraphs,
        structural_selection.clone(),
        "delete-cross-leaf-exact",
    )?;
    let leaf_commit = enabled_delete(&registry, &leaf_exact)?.execute(&leaf_exact)?;
    assert_paragraph_runs(leaf_commit.after().document(), 0, &[("aabb", false)])?;

    let leaf_over_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(3),
    );
    let leaf_over = state(
        &leaf_over_context,
        &leaf_paragraphs,
        structural_selection.clone(),
        "delete-cross-leaf-over",
    )?;
    assert_disabled(&registry, &leaf_over, "breditor/result-limit-exceeded")?;

    let child_paragraphs = [
        paragraph_value(&[("a", false), ("B", true)]),
        paragraph_value(&[("c", false), ("D", true)]),
    ];
    let child_selection =
        selected(text_point(0, 1, 1, Affinity::Before)?, text_point(1, 0, 0, Affinity::After)?);
    let child_exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(4),
    );
    let child_exact = state(
        &child_exact_context,
        &child_paragraphs,
        child_selection.clone(),
        "delete-cross-child-exact",
    )?;
    let child_commit = enabled_delete(&registry, &child_exact)?.execute(&child_exact)?;
    assert_paragraph_runs(
        child_commit.after().document(),
        0,
        &[("a", false), ("B", true), ("c", false), ("D", true)],
    )?;

    let child_over_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(3),
    );
    let child_over =
        state(&child_over_context, &child_paragraphs, child_selection, "delete-cross-child-over")?;
    assert_disabled(&registry, &child_over, "breditor/result-limit-exceeded")?;

    // Empty replacement never increases root children, global node count,
    // total text bytes, or per-run format count. Only leaf coalescing and the
    // surviving paragraph's local child count can exceed a valid base limit.
    let root_node_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(2).with_max_nodes(3),
    );
    let root_node = state(
        &root_node_context,
        &[paragraph_value(&[]), paragraph_value(&[])],
        selected(child_point(0, 0, Affinity::Before)?, child_point(1, 0, Affinity::After)?),
        "delete-cross-root-node-monotonic",
    )?;
    assert_eq!(root_node.document().summary().node_count(), 3);
    assert_paragraph_count(root_node.document(), 2)?;
    let root_node_commit = enabled_delete(&registry, &root_node)?.execute(&root_node)?;
    assert_eq!(root_node_commit.after().document().summary().node_count(), 2);
    assert_paragraph_count(root_node_commit.after().document(), 1)?;

    let total_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(4),
    );
    let total = state(
        &total_context,
        &leaf_paragraphs,
        structural_selection.clone(),
        "delete-cross-total-monotonic",
    )?;
    assert_eq!(total.document().summary().total_text_bytes(), 4);
    let total_commit = enabled_delete(&registry, &total)?.execute(&total)?;
    assert_eq!(total_commit.after().document().summary().total_text_bytes(), 4);

    let decreasing_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(8),
    );
    let decreasing = state(
        &decreasing_context,
        &[
            paragraph_value(&[("zz", false)]),
            paragraph_value(&[("abc", false)]),
            paragraph_value(&[("def", false)]),
        ],
        selected(text_point(1, 0, 1, Affinity::Before)?, text_point(2, 0, 2, Affinity::After)?),
        "delete-cross-total-decreasing-off-span",
    )?;
    assert_eq!(decreasing.document().summary().total_text_bytes(), 8);
    let decreasing_commit = enabled_delete(&registry, &decreasing)?.execute(&decreasing)?;
    assert_eq!(decreasing_commit.after().document().summary().total_text_bytes(), 4);
    assert_paragraph_runs(decreasing_commit.after().document(), 0, &[("zz", false)])?;
    assert_paragraph_runs(decreasing_commit.after().document(), 1, &[("af", false)])?;

    let budget_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(3),
    )
    .with_max_operations_per_transaction(0);
    let budget = state(
        &budget_context,
        &leaf_paragraphs,
        structural_selection,
        "delete-cross-budget-precedes-result-limit",
    )?;
    assert_disabled(&registry, &budget, "breditor/operation-budget-exceeded")?;
    Ok(())
}

#[test]
fn catalog_reports_enabled_and_result_disabled_cross_sources_without_mutation() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let selection =
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(1, 0, 0, Affinity::After)?);
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("B", true)])],
        selection.clone(),
        "delete-cross-catalog-enabled",
    )?;
    let initial_copy = initial.clone();
    let session = EditorSession::new(initial);
    let enabled_id = state_id("breditor/delete-cross-enabled")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![ActionStateRegistration::new(
            enabled_id.clone(),
            ActionStateSource::direct(delete_invocation()),
        )],
    )?;
    let batch = catalog.derive(&session)?;
    let outcome = resolved(&batch, &enabled_id)?;
    assert!(outcome.availability().is_enabled());
    assert_eq!(outcome.indicator().activation(), ActionActivation::Stateless);
    assert_eq!(
        outcome.actual_writes(),
        Some(
            ActionStateDomains::DOCUMENT
                | ActionStateDomains::SELECTION
                | ActionStateDomains::HISTORY
                | ActionStateDomains::SNAPSHOT,
        )
    );
    assert_eq!(session.state(), &initial_copy);
    assert!(matches!(
        enabled_delete(catalog.action_registry(), session.state())?.transaction().operations(),
        [Operation::RootTextReplace(_)]
    ));

    let limited_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(1),
    );
    let limited = state(
        &limited_context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("b", false)])],
        selection,
        "delete-cross-catalog-disabled",
    )?;
    let limited_copy = limited.clone();
    let limited_session = EditorSession::new(limited);
    let disabled_id = state_id("breditor/delete-cross-disabled")?;
    let limited_catalog = ActionStateCatalog::try_new(
        base_action_registry()?,
        vec![ActionStateRegistration::new(
            disabled_id.clone(),
            ActionStateSource::direct(delete_invocation()),
        )],
    )?;
    let limited_batch = limited_catalog.derive(&limited_session)?;
    let disabled = resolved(&limited_batch, &disabled_id)?;
    assert_eq!(
        disabled.availability().reason().map(|reason| reason.code().as_str()),
        Some("breditor/result-limit-exceeded")
    );
    assert_eq!(disabled.actual_writes(), None);
    assert_eq!(limited_session.state(), &limited_copy);
    Ok(())
}

#[test]
fn selected_then_adjacent_grapheme_delete_are_distinct_undo_steps() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial_selection =
        selected(text_point(2, 0, 0, Affinity::After)?, text_point(0, 0, 2, Affinity::Before)?);
    let initial = state(
        &context,
        &[
            paragraph_value(&[("ab", false)]),
            paragraph_value(&[("middle", false)]),
            paragraph_value(&[("CD", true)]),
        ],
        initial_selection.clone(),
        "delete-cross-merged-history",
    )?;
    let initial_copy = initial.clone();
    let mut session = EditorSession::new(initial);

    let first = registry.prepare(session.state(), &delete_invocation())?;
    let first_commit = session.execute_prepared_action(first)?;
    assert!(matches!(first_commit.forward_operations(), [Operation::RootTextReplace(_)]));
    assert!(matches!(first_commit.inverse_operations(), [Operation::RootTextReplace(_)]));
    assert_paragraph_runs(session.state().document(), 0, &[("ab", false), ("CD", true)])?;
    assert_exact_caret(session.state(), &text_point(0, 1, 0, Affinity::After)?)?;
    assert_eq!(session.state().pending_formats(), None);

    let second = registry.prepare(session.state(), &delete_invocation())?;
    let second_commit = session.execute_prepared_action(second)?;
    assert!(matches!(second_commit.forward_operations(), [Operation::TextSplice(_)]));
    assert_paragraph_runs(session.state().document(), 0, &[("a", false), ("CD", true)])?;
    assert_exact_caret(session.state(), &text_point(0, 1, 0, Affinity::After)?)?;
    assert_eq!(session.state().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (2, 0));
    let final_state = session.state().clone();

    let Some(undo_grapheme) = session.undo()? else {
        return Err(test_error("adjacent grapheme deletion was not undoable").into());
    };
    assert!(matches!(undo_grapheme.forward_operations(), [Operation::TextSplice(_)]));
    assert_paragraph_runs(session.state().document(), 0, &[("ab", false), ("CD", true)])?;
    assert_exact_caret(session.state(), &text_point(0, 1, 0, Affinity::After)?)?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 1));

    let Some(undo_selection) = session.undo()? else {
        return Err(test_error("selected cross-paragraph deletion was not undoable").into());
    };
    assert!(matches!(undo_selection.forward_operations(), [Operation::RootTextReplace(_)]));
    assert_eq!(undo_selection.after().document(), initial_copy.document());
    assert_eq!(undo_selection.after().selection(), Some(&initial_selection));
    assert_eq!(undo_selection.after().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 2));

    let Some(redo_selection) = session.redo()? else {
        return Err(test_error("selected cross-paragraph deletion was not redoable").into());
    };
    assert!(matches!(redo_selection.forward_operations(), [Operation::RootTextReplace(_)]));
    assert_paragraph_runs(session.state().document(), 0, &[("ab", false), ("CD", true)])?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 1));

    let Some(redo_grapheme) = session.redo()? else {
        return Err(test_error("adjacent grapheme deletion was not redoable").into());
    };
    assert!(matches!(redo_grapheme.forward_operations(), [Operation::TextSplice(_)]));
    assert_eq!(redo_grapheme.after().document(), final_state.document());
    assert_eq!(redo_grapheme.after().selection(), final_state.selection());
    assert_eq!(redo_grapheme.after().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (2, 0));
    Ok(())
}
