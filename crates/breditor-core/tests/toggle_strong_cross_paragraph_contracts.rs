//! Black-box contracts for strong-format toggling across base paragraphs.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionInvocation, ActionPreparation, ActionRegistry, ActionStateBatch,
        ActionStateCache, ActionStateCatalog, ActionStateDomains, ActionStateId,
        ActionStateOutcome, ActionStateRegistration, ActionStateSource, ObservedAvailability,
        PreparedAction, ResolvedActionState,
        builtins::{base_action_registry, toggle_strong_action_id},
    },
    codec::DocumentJsonCodec,
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{DeletedPointPolicy, Operation, RootTextReplace, SelectionRelocationPolicy},
    position::{Affinity, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    selection::{RangeOrder, RangeSelection, ResolvedSelection, Selection},
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

fn invocation() -> ActionInvocation {
    ActionInvocation::without_input(toggle_strong_action_id())
}

fn prepare(
    registry: &ActionRegistry,
    state: &EditorState,
) -> Result<ActionPreparation, Box<dyn Error>> {
    registry.prepare(state, &invocation()).map_err(Into::into)
}

fn enabled(
    registry: &ActionRegistry,
    state: &EditorState,
) -> Result<PreparedAction, Box<dyn Error>> {
    match prepare(registry, state)? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => Err(test_error(format!(
            "cross-paragraph strong toggle unexpectedly disabled: {}",
            prepared.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    expected_code: &str,
    expected_activation: ActionActivation,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(prepared) = prepare(registry, state)? else {
        return Err(test_error(format!("expected disabled reason {expected_code}")).into());
    };
    assert_eq!(prepared.reason().code().as_str(), expected_code);
    assert_eq!(prepared.reason().detail(), None);
    assert_eq!(prepared.indicator().activation(), expected_activation);
    assert_eq!(prepared.base_state(), state);
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

fn assert_exact_range(state: &EditorState, anchor: &Point, focus: &Point) -> TestResult {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(test_error("result did not contain a range selection").into());
    };
    assert_eq!(range.anchor(), anchor);
    assert_eq!(range.focus(), focus);
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
fn global_inactive_active_and_mixed_activation_controls_every_selected_run() -> TestResult {
    struct Case {
        lineage: &'static str,
        first: (&'static str, bool),
        last: (&'static str, bool),
        activation: ActionActivation,
        result_strong: bool,
    }

    let cases = [
        Case {
            lineage: "strong-cross-global-inactive",
            first: ("a", false),
            last: ("b", false),
            activation: ActionActivation::Inactive,
            result_strong: true,
        },
        Case {
            lineage: "strong-cross-global-active",
            first: ("A", true),
            last: ("B", true),
            activation: ActionActivation::Active,
            result_strong: false,
        },
        Case {
            lineage: "strong-cross-global-mixed",
            first: ("a", false),
            last: ("B", true),
            activation: ActionActivation::Mixed,
            result_strong: true,
        },
    ];

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for case in cases {
        let initial = state(
            &context,
            &[paragraph_value(&[case.first]), paragraph_value(&[]), paragraph_value(&[case.last])],
            selected(text_point(0, 0, 0, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?),
            case.lineage,
        )?;
        let prepared = enabled(&registry, &initial)?;
        assert_eq!(prepared.indicator().activation(), case.activation);
        let commit = prepared.execute(&initial)?;
        assert!(matches!(commit.forward_operations(), [Operation::RootTextReplace(_)]));
        assert_paragraph_count(commit.after().document(), 3)?;
        assert_paragraph_runs(commit.after().document(), 0, &[(case.first.0, case.result_strong)])?;
        assert_paragraph_runs(commit.after().document(), 1, &[])?;
        assert_paragraph_runs(commit.after().document(), 2, &[(case.last.0, case.result_strong)])?;
    }

    let partial_active = state(
        &context,
        &[paragraph_value(&[("AB", true)]), paragraph_value(&[]), paragraph_value(&[("CD", true)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?),
        "strong-cross-global-active-partial",
    )?;
    let prepared = enabled(&registry, &partial_active)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Active);
    let commit = prepared.execute(&partial_active)?;
    assert_paragraph_runs(commit.after().document(), 0, &[("A", true), ("B", false)])?;
    assert_paragraph_runs(commit.after().document(), 1, &[])?;
    assert_paragraph_runs(commit.after().document(), 2, &[("C", false), ("D", true)])?;
    assert_exact_range(
        commit.after(),
        &text_point(0, 1, 0, Affinity::Before)?,
        &text_point(2, 1, 0, Affinity::After)?,
    )?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn structural_only_ranges_are_uniformly_disabled_across_aliases_direction_and_budget() -> TestResult
{
    let registry = base_action_registry()?;
    for maximum_operations in [0, 1] {
        let context =
            EditorContext::default().with_max_operations_per_transaction(maximum_operations);
        for left_affinity in [Affinity::Before, Affinity::After] {
            for right_affinity in [Affinity::Before, Affinity::After] {
                let left_aliases =
                    [text_point(0, 0, 1, left_affinity)?, child_point(0, 1, left_affinity)?];
                let right_aliases =
                    [child_point(1, 0, right_affinity)?, text_point(1, 0, 0, right_affinity)?];
                for left in &left_aliases {
                    for right in &right_aliases {
                        for backward in [false, true] {
                            let selection = if backward {
                                selected(right.clone(), left.clone())
                            } else {
                                selected(left.clone(), right.clone())
                            };
                            let initial = state(
                                &context,
                                &[
                                    paragraph_value(&[("a", false)]),
                                    paragraph_value(&[("B", true)]),
                                ],
                                selection,
                                "strong-cross-structural-only-alias",
                            )?;
                            assert_disabled(
                                &registry,
                                &initial,
                                "breditor/no-selected-text",
                                ActionActivation::Inactive,
                            )?;
                        }
                    }
                }
            }
        }

        let empty = state(
            &context,
            &[paragraph_value(&[]), paragraph_value(&[]), paragraph_value(&[])],
            selected(child_point(2, 0, Affinity::After)?, child_point(0, 0, Affinity::Before)?),
            "strong-cross-structural-only-empty",
        )?;
        assert_disabled(
            &registry,
            &empty,
            "breditor/no-selected-text",
            ActionActivation::Inactive,
        )?;
    }
    Ok(())
}

#[test]
fn exact_mixed_root_recipe_inverse_and_canonical_selection_are_closed() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[
            paragraph_value(&[("outside-left", true)]),
            paragraph_value(&[("ab", false)]),
            paragraph_value(&[("C", true), ("d", false)]),
            paragraph_value(&[("e", false), ("F", true)]),
            paragraph_value(&[("outside-right", false)]),
        ],
        selected(text_point(1, 0, 1, Affinity::Before)?, text_point(3, 0, 1, Affinity::After)?),
        "strong-cross-exact-root-recipe",
    )?;
    let prepared = enabled(&registry, &initial)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
    let transaction = prepared.transaction();
    let operation = only_root_replace(transaction.operations())?;
    assert_eq!(operation.range().start().paragraph_path(), &path(&[1])?);
    assert_eq!(operation.range().start().offset(), TextOffset::try_new(1)?);
    assert_eq!(operation.range().end().paragraph_path(), &path(&[3])?);
    assert_eq!(operation.range().end().offset(), TextOffset::try_new(1)?);
    assert_eq!(
        operation.expected_paragraphs(),
        &[
            fragment(&[("ab", false)])?,
            fragment(&[("C", true), ("d", false)])?,
            fragment(&[("e", false), ("F", true)])?,
        ]
    );
    assert_eq!(
        operation.replacement_paragraphs(),
        &[fragment(&[("b", true)])?, fragment(&[("Cd", true)])?, fragment(&[("e", true)])?,]
    );
    assert_eq!(
        transaction.selection_relocation(),
        SelectionRelocationPolicy::new(DeletedPointPolicy::Reject, DeletedPointPolicy::Reject)
    );
    assert_eq!(
        transaction.selection_update(),
        &SelectionUpdate::Set(Some(selected(
            text_point(1, 1, 0, Affinity::Before)?,
            text_point(3, 0, 1, Affinity::After)?,
        )))
    );
    assert_eq!(transaction.pending_formats_update(), &PendingFormatsUpdate::Set(None));
    assert_eq!(transaction.metadata().history(), &HistoryIntent::Record);

    let commit = prepared.execute(&initial)?;
    assert_paragraph_count(commit.after().document(), 5)?;
    assert_paragraph_runs(commit.after().document(), 0, &[("outside-left", true)])?;
    assert_paragraph_runs(commit.after().document(), 1, &[("a", false), ("b", true)])?;
    assert_paragraph_runs(commit.after().document(), 2, &[("Cd", true)])?;
    assert_paragraph_runs(commit.after().document(), 3, &[("eF", true)])?;
    assert_paragraph_runs(commit.after().document(), 4, &[("outside-right", false)])?;
    assert_exact_range(
        commit.after(),
        &text_point(1, 1, 0, Affinity::Before)?,
        &text_point(3, 0, 1, Affinity::After)?,
    )?;

    let inverse = only_root_replace(commit.inverse_operations())?;
    assert_eq!(inverse.range().start().paragraph_path(), &path(&[1])?);
    assert_eq!(inverse.range().start().offset(), TextOffset::try_new(1)?);
    assert_eq!(inverse.range().end().paragraph_path(), &path(&[3])?);
    assert_eq!(inverse.range().end().offset(), TextOffset::try_new(1)?);
    assert_eq!(
        inverse.expected_paragraphs(),
        &[
            fragment(&[("a", false), ("b", true)])?,
            fragment(&[("Cd", true)])?,
            fragment(&[("eF", true)])?,
        ]
    );
    assert_eq!(
        inverse.replacement_paragraphs(),
        &[
            fragment(&[("b", false)])?,
            fragment(&[("C", true), ("d", false)])?,
            fragment(&[("e", false)])?,
        ]
    );
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn direction_affinity_and_seam_aliases_canonicalize_without_crossing_block_boundaries() -> TestResult
{
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let paragraphs = [
        paragraph_value(&[("a", false), ("B", true)]),
        paragraph_value(&[]),
        paragraph_value(&[("c", false), ("D", true)]),
    ];
    for start_affinity in [Affinity::Before, Affinity::After] {
        for end_affinity in [Affinity::Before, Affinity::After] {
            let starts = [
                text_point(0, 0, 1, start_affinity)?,
                child_point(0, 1, start_affinity)?,
                text_point(0, 1, 0, start_affinity)?,
            ];
            let ends = [
                text_point(2, 0, 1, end_affinity)?,
                child_point(2, 1, end_affinity)?,
                text_point(2, 1, 0, end_affinity)?,
            ];
            for start in &starts {
                for end in &ends {
                    for backward in [false, true] {
                        let selection = if backward {
                            selected(end.clone(), start.clone())
                        } else {
                            selected(start.clone(), end.clone())
                        };
                        let initial = state(
                            &context,
                            &paragraphs,
                            selection,
                            "strong-cross-direction-affinity-alias",
                        )?;
                        let prepared = enabled(&registry, &initial)?;
                        assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
                        assert_eq!(prepared.transaction().operations().len(), 1);
                        let commit = prepared.execute(&initial)?;
                        assert_paragraph_count(commit.after().document(), 3)?;
                        assert_paragraph_runs(
                            commit.after().document(),
                            0,
                            &[("a", false), ("B", true)],
                        )?;
                        assert_paragraph_runs(commit.after().document(), 1, &[])?;
                        assert_paragraph_runs(commit.after().document(), 2, &[("cD", true)])?;
                        let canonical_start = text_point(0, 1, 0, start_affinity)?;
                        let canonical_end = text_point(2, 0, 1, end_affinity)?;
                        let (anchor, focus) = if backward {
                            (&canonical_end, &canonical_start)
                        } else {
                            (&canonical_start, &canonical_end)
                        };
                        assert_exact_range(commit.after(), anchor, focus)?;
                        let ResolvedSelection::Range(resolved) = commit
                            .after()
                            .selection()
                            .ok_or_else(|| test_error("result selection was absent"))?
                            .resolve(context.schema(), commit.after().document())?;
                        assert_eq!(
                            resolved.order(),
                            if backward { RangeOrder::Backward } else { RangeOrder::Forward }
                        );
                    }
                }
            }
        }
    }
    Ok(())
}

#[test]
fn empty_middle_nonzero_and_non_bmp_boundaries_preserve_exact_text_and_blocks() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[
            paragraph_value(&[("outside-left", true)]),
            paragraph_value(&[("a😀x", false)]),
            paragraph_value(&[]),
            paragraph_value(&[("Y😀z", false)]),
            paragraph_value(&[("outside-right", false)]),
        ],
        selected(text_point(3, 0, 3, Affinity::After)?, text_point(1, 0, 1, Affinity::Before)?),
        "strong-cross-non-bmp-nonzero",
    )?;
    let prepared = enabled(&registry, &initial)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
    let operation = only_root_replace(prepared.transaction().operations())?;
    assert_eq!(operation.range().start().offset(), TextOffset::try_new(1)?);
    assert_eq!(operation.range().end().offset(), TextOffset::try_new(3)?);
    let commit = prepared.execute(&initial)?;
    assert_paragraph_count(commit.after().document(), 5)?;
    assert_paragraph_runs(commit.after().document(), 0, &[("outside-left", true)])?;
    assert_paragraph_runs(commit.after().document(), 1, &[("a", false), ("😀x", true)])?;
    assert_paragraph_runs(commit.after().document(), 2, &[])?;
    assert_paragraph_runs(commit.after().document(), 3, &[("Y😀", true), ("z", false)])?;
    assert_paragraph_runs(commit.after().document(), 4, &[("outside-right", false)])?;
    assert_exact_range(
        commit.after(),
        &text_point(3, 1, 0, Affinity::After)?,
        &text_point(1, 1, 0, Affinity::Before)?,
    )?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn reachable_format_leaf_child_and_node_limits_disable_with_truthful_activation() -> TestResult {
    let registry = base_action_registry()?;

    let no_formats = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_formats_per_text(0),
    );
    let format_state = state(
        &no_formats,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("b", false)])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(1, 0, 1, Affinity::After)?),
        "strong-cross-format-limit",
    )?;
    assert_disabled(
        &registry,
        &format_state,
        "breditor/result-limit-exceeded",
        ActionActivation::Inactive,
    )?;

    let leaf_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(2),
    );
    let leaf_state = state(
        &leaf_context,
        &[paragraph_value(&[("aa", false), ("BB", true)]), paragraph_value(&[("CC", true)])],
        selected(text_point(0, 1, 0, Affinity::Before)?, text_point(1, 0, 2, Affinity::After)?),
        "strong-cross-leaf-limit",
    )?;
    assert_disabled(
        &registry,
        &leaf_state,
        "breditor/result-limit-exceeded",
        ActionActivation::Active,
    )?;

    let split_paragraphs = [
        paragraph_value(&[("A", true), ("b", false), ("CD", true)]),
        paragraph_value(&[("E", true)]),
        paragraph_value(&[("FG", true), ("h", false), ("I", true)]),
    ];
    let split_selection =
        selected(text_point(0, 2, 1, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?);
    let child_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(3),
    );
    let child_state = state(
        &child_context,
        &split_paragraphs,
        split_selection.clone(),
        "strong-cross-child-limit",
    )?;
    assert_disabled(
        &registry,
        &child_state,
        "breditor/result-limit-exceeded",
        ActionActivation::Active,
    )?;

    let node_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(4).with_max_nodes(11),
    );
    let node_state =
        state(&node_context, &split_paragraphs, split_selection, "strong-cross-node-limit")?;
    assert_eq!(node_state.document().summary().node_count(), 11);
    assert_disabled(
        &registry,
        &node_state,
        "breditor/result-limit-exceeded",
        ActionActivation::Active,
    )?;

    let exact_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default()
            .with_max_children_per_element(3)
            .with_max_nodes(6)
            .with_max_text_bytes(2)
            .with_max_total_text_bytes(4),
    )
    .with_max_operations_per_transaction(1);
    let exact_paragraphs = [
        paragraph_value(&[("ab", false)]),
        paragraph_value(&[]),
        paragraph_value(&[("cd", false)]),
    ];
    let exact_selection =
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(2, 0, 2, Affinity::After)?);
    let exact = state(
        &exact_context,
        &exact_paragraphs,
        exact_selection.clone(),
        "strong-cross-root-total-exact",
    )?;
    let exact_commit = enabled(&registry, &exact)?.execute(&exact)?;
    assert_eq!(exact_commit.after().document().summary().node_count(), 6);
    assert_eq!(exact_commit.after().document().summary().total_text_bytes(), 4);
    assert_paragraph_count(exact_commit.after().document(), 3)?;

    let budget_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_formats_per_text(0),
    )
    .with_max_operations_per_transaction(0);
    let budget = state(
        &budget_context,
        &exact_paragraphs,
        exact_selection,
        "strong-cross-budget-precedes-result-limit",
    )?;
    assert_disabled(
        &registry,
        &budget,
        "breditor/operation-budget-exceeded",
        ActionActivation::Inactive,
    )?;
    Ok(())
}

#[test]
fn catalog_cache_and_session_publish_cross_activation_transitions() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("b", false)])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(1, 0, 1, Affinity::After)?),
        "strong-cross-cache-transitions",
    )?;
    let id = state_id("breditor/strong-cross-control")?;
    let catalog = ActionStateCatalog::try_new(
        registry.clone(),
        vec![ActionStateRegistration::new(id.clone(), ActionStateSource::direct(invocation()))],
    )?;
    let mut session = EditorSession::new(initial);
    let mut cache = ActionStateCache::new(catalog);
    let first = cache.refresh(&session)?;
    let first_state = resolved(first.observation().batch(), &id)?;
    assert_eq!(first_state.availability(), &ObservedAvailability::Enabled);
    assert_eq!(first_state.indicator().activation(), ActionActivation::Inactive);
    assert_eq!(
        first_state.actual_writes(),
        Some(
            ActionStateDomains::DOCUMENT
                | ActionStateDomains::HISTORY
                | ActionStateDomains::SNAPSHOT,
        )
    );

    let first_toggle = registry.prepare(session.state(), &invocation())?;
    session.execute_prepared_action(first_toggle)?;
    assert_eq!(session.undo_depth(), 1);
    let active = cache.refresh(&session)?;
    assert!(active.is_delta());
    assert_eq!(
        resolved(active.observation().batch(), &id)?.indicator().activation(),
        ActionActivation::Active
    );

    let second_toggle = registry.prepare(session.state(), &invocation())?;
    session.execute_prepared_action(second_toggle)?;
    assert_eq!(session.undo_depth(), 2, "Record toggles must remain independent history events");
    let inactive = cache.refresh(&session)?;
    assert!(inactive.is_delta());
    assert_eq!(
        resolved(inactive.observation().batch(), &id)?.indicator().activation(),
        ActionActivation::Inactive
    );

    let empty = state(
        &context,
        &[paragraph_value(&[]), paragraph_value(&[])],
        selected(child_point(0, 0, Affinity::Before)?, child_point(1, 0, Affinity::After)?),
        "strong-cross-catalog-empty",
    )?;
    let empty_copy = empty.clone();
    let empty_session = EditorSession::new(empty);
    let empty_id = state_id("breditor/strong-cross-empty")?;
    let empty_catalog = ActionStateCatalog::try_new(
        base_action_registry()?,
        vec![ActionStateRegistration::new(
            empty_id.clone(),
            ActionStateSource::direct(invocation()),
        )],
    )?;
    let empty_batch = empty_catalog.derive(&empty_session)?;
    let empty_state = resolved(&empty_batch, &empty_id)?;
    assert_eq!(empty_state.indicator().activation(), ActionActivation::Inactive);
    assert_eq!(
        empty_state.availability().reason().map(|reason| reason.code().as_str()),
        Some("breditor/no-selected-text")
    );
    assert_eq!(empty_state.actual_writes(), None);
    assert_eq!(empty_session.state(), &empty_copy);
    Ok(())
}

#[test]
fn cross_toggle_undo_redo_restores_exact_direction_affinities_and_pending_state() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial_selection =
        selected(text_point(2, 0, 1, Affinity::After)?, text_point(0, 0, 1, Affinity::Before)?);
    let initial = state(
        &context,
        &[
            paragraph_value(&[("ab", false)]),
            paragraph_value(&[("C", true), ("d", false)]),
            paragraph_value(&[("e", false), ("F", true)]),
        ],
        initial_selection.clone(),
        "strong-cross-history",
    )?;
    let initial_copy = initial.clone();
    let mut session = EditorSession::new(initial);
    let prepared = registry.prepare(session.state(), &invocation())?;
    let commit = session.execute_prepared_action(prepared)?;
    assert!(matches!(commit.forward_operations(), [Operation::RootTextReplace(_)]));
    assert!(matches!(commit.inverse_operations(), [Operation::RootTextReplace(_)]));
    assert_eq!(commit.metadata().history(), &HistoryIntent::Record);
    let result = session.state().clone();
    assert_eq!(session.state().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    let Some(undo) = session.undo()? else {
        return Err(test_error("cross strong toggle was not undoable").into());
    };
    assert!(matches!(undo.forward_operations(), [Operation::RootTextReplace(_)]));
    assert_eq!(undo.after().document(), initial_copy.document());
    assert_eq!(undo.after().selection(), Some(&initial_selection));
    assert_eq!(undo.after().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let Some(redo) = session.redo()? else {
        return Err(test_error("cross strong toggle was not redoable").into());
    };
    assert!(matches!(redo.forward_operations(), [Operation::RootTextReplace(_)]));
    assert_eq!(redo.after().document(), result.document());
    assert_eq!(redo.after().selection(), result.selection());
    assert_eq!(redo.after().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    Ok(())
}
