//! Black-box contracts for the base editing actions.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivationContract, ActionExecutionError, ActionId, ActionInvocation,
        ActionPreparation, ActionRegistry, ActionStateDomains, PreparedAction,
        builtins::{
            base_action_registry, delete_backward_action_id, insert_paragraph_break_action_id,
            insert_text_action_id, insert_text_input_contract, toggle_strong_action_id,
        },
    },
    codec::DocumentJsonCodec,
    document::{Document, Format, FormatSet, PropertyMap},
    identity::QualifiedName,
    operation::Operation,
    position::{Affinity, Point},
    schema::DocumentLimits,
    selection::{RangeSelection, ResolvedSelection, Selection},
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{Commit, HistoryIntent, TransactionOutcome},
};
use serde_json::Value;
use support::{document_json, paragraph, path, test_error, text_node};

type TestResult = Result<(), Box<dyn Error>>;

fn strong_formats() -> Result<FormatSet, Box<dyn Error>> {
    Ok(FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])?)
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

fn prepared(
    registry: &ActionRegistry,
    state: &EditorState,
    id: ActionId,
) -> Result<PreparedAction, Box<dyn Error>> {
    match registry.prepare(state, &invocation(id))? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => {
            Err(test_error(format!("action unexpectedly disabled: {}", prepared.reason().code()))
                .into())
        }
    }
}

fn execute(
    registry: &ActionRegistry,
    state: &EditorState,
    id: ActionId,
) -> Result<Commit, Box<dyn Error>> {
    prepared(registry, state, id)?.execute(state).map_err(Into::into)
}

fn committed(outcome: TransactionOutcome) -> Result<Commit, Box<dyn Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
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
        assert_eq!(!text.formats().is_empty(), *expected_strong);
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

fn assert_action_metadata(commit: &Commit, id: &ActionId, history: &HistoryIntent) {
    assert_eq!(commit.metadata().action(), Some(id.qualified_name()));
    assert_eq!(commit.metadata().history(), history);
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    id: ActionId,
    expected_code: &str,
) -> TestResult {
    let original = state.clone();
    let original_revision = state.snapshot().revision();
    let preparation = registry.prepare(state, &invocation(id))?;
    let ActionPreparation::Disabled(disabled) = preparation else {
        return Err(test_error(format!("expected disabled reason {expected_code}")).into());
    };
    let reason = disabled.reason().clone();
    assert_eq!(disabled.base_state(), state);
    assert_eq!(reason.code().as_str(), expected_code);
    assert_eq!(reason.detail(), None);
    assert_eq!(state, &original);
    assert_eq!(state.snapshot().revision(), original_revision);
    assert_eq!(
        ActionPreparation::Disabled(disabled).execute(state),
        Err(ActionExecutionError::Disabled { reason })
    );
    assert_eq!(state, &original);
    Ok(())
}

#[test]
fn builtin_registry_uses_semantic_ids_lexical_order_and_one_preparation_path() -> TestResult {
    let registry = base_action_registry()?;
    let delete_id = delete_backward_action_id();
    let enter_id = insert_paragraph_break_action_id();
    let insert_text_id = insert_text_action_id();
    let strong_id = toggle_strong_action_id();
    assert_eq!(delete_id.as_str(), "breditor/delete-backward");
    assert_eq!(enter_id.as_str(), "breditor/insert-paragraph-break");
    assert_eq!(insert_text_id.as_str(), "breditor/insert-text");
    assert_eq!(strong_id.as_str(), "breditor/toggle-strong");
    assert_eq!(registry.len(), 4);
    let descriptors = registry.descriptors().collect::<Vec<_>>();
    assert_eq!(descriptors[0].id(), &delete_id);
    assert_eq!(descriptors[1].id(), &enter_id);
    assert_eq!(descriptors[2].id(), &insert_text_id);
    assert_eq!(descriptors[3].id(), &strong_id);
    assert_eq!(descriptors[0].input_contract(), None);
    assert_eq!(descriptors[1].input_contract(), None);
    assert_eq!(descriptors[2].input_contract(), Some(&insert_text_input_contract()));
    assert_eq!(descriptors[3].input_contract(), None);
    let insert_effects = descriptors[2].state_spec().effects();
    assert_eq!(
        insert_effects.reads(),
        ActionStateDomains::DOCUMENT
            | ActionStateDomains::SELECTION
            | ActionStateDomains::PENDING_FORMATS
            | ActionStateDomains::CONTEXT
            | ActionStateDomains::SNAPSHOT
    );
    assert_eq!(
        insert_effects.may_write(),
        ActionStateDomains::DOCUMENT
            | ActionStateDomains::SELECTION
            | ActionStateDomains::PENDING_FORMATS
            | ActionStateDomains::HISTORY
            | ActionStateDomains::SNAPSHOT
    );
    assert_eq!(
        descriptors[3].state_spec().contract().activation_contract(),
        ActionActivationContract::Tracked
    );
    assert_eq!(descriptors[3].state_spec().contract().value_contract(), None);
    let strong_effects = descriptors[3].state_spec().effects();
    assert_eq!(
        strong_effects.reads(),
        ActionStateDomains::DOCUMENT
            | ActionStateDomains::SELECTION
            | ActionStateDomains::PENDING_FORMATS
            | ActionStateDomains::CONTEXT
            | ActionStateDomains::SNAPSHOT
    );
    assert_eq!(
        strong_effects.may_write(),
        ActionStateDomains::DOCUMENT
            | ActionStateDomains::SELECTION
            | ActionStateDomains::PENDING_FORMATS
            | ActionStateDomains::HISTORY
            | ActionStateDomains::SNAPSHOT
    );

    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("ab", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "builtin-parity",
    )?;
    let original = initial.clone();
    for id in [delete_id, enter_id, strong_id] {
        let keyboard = prepared(&registry, &initial, id.clone())?;
        let toolbar = prepared(&registry, &initial, id)?;
        assert_eq!(keyboard.transaction(), toolbar.transaction());
        assert_eq!(keyboard.base_state(), &initial);
    }
    assert_eq!(initial, original);
    assert_eq!(initial.snapshot().revision(), Revision::ZERO);
    Ok(())
}

#[test]
fn enter_splits_empty_start_middle_end_non_bmp_and_formatted_run_seam() -> TestResult {
    struct Case {
        lineage: &'static str,
        source: Vec<(&'static str, bool)>,
        caret: Point,
        left: Vec<(&'static str, bool)>,
        right: Vec<(&'static str, bool)>,
    }

    let cases = vec![
        Case {
            lineage: "enter-empty",
            source: vec![],
            caret: child_point(0, 0, Affinity::Before)?,
            left: vec![],
            right: vec![],
        },
        Case {
            lineage: "enter-start",
            source: vec![("ab", false)],
            caret: text_point(0, 0, 0, Affinity::Before)?,
            left: vec![],
            right: vec![("ab", false)],
        },
        Case {
            lineage: "enter-middle",
            source: vec![("ab", false)],
            caret: text_point(0, 0, 1, Affinity::Before)?,
            left: vec![("a", false)],
            right: vec![("b", false)],
        },
        Case {
            lineage: "enter-end",
            source: vec![("ab", false)],
            caret: text_point(0, 0, 2, Affinity::After)?,
            left: vec![("ab", false)],
            right: vec![],
        },
        Case {
            lineage: "enter-non-bmp",
            source: vec![("a😀b", false)],
            caret: text_point(0, 0, 3, Affinity::After)?,
            left: vec![("a😀", false)],
            right: vec![("b", false)],
        },
        Case {
            lineage: "enter-run-seam",
            source: vec![("ab", false), ("CD", true)],
            caret: child_point(0, 1, Affinity::Before)?,
            left: vec![("ab", false)],
            right: vec![("CD", true)],
        },
    ];
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let enter_id = insert_paragraph_break_action_id();
    for case in cases {
        let initial = state(
            &context,
            &[paragraph_value(&case.source)],
            Some(collapsed(case.caret)),
            None,
            case.lineage,
        )?;
        let commit = execute(&registry, &initial, enter_id.clone())?;
        assert!(matches!(commit.forward_operations(), [Operation::ParagraphSplit(_)]));
        assert_paragraph_count(commit.after().document(), 2)?;
        assert_paragraph_runs(commit.after().document(), 0, &case.left)?;
        assert_paragraph_runs(commit.after().document(), 1, &case.right)?;
        assert_exact_caret(
            commit.after(),
            &Point::Children {
                parent_path: path(&[1])?,
                child_index: 0,
                affinity: Affinity::After,
            },
        )?;
        assert_eq!(commit.after().pending_formats(), None);
        assert_eq!(commit.revision(), Revision::new(1));
        assert_action_metadata(&commit, &enter_id, &HistoryIntent::Record);
    }
    Ok(())
}

#[test]
fn enter_replaces_forward_and_backward_same_paragraph_ranges_before_split() -> TestResult {
    let registry = base_action_registry()?;
    let enter_id = insert_paragraph_break_action_id();
    let context = EditorContext::default();
    let early = text_point(0, 0, 1, Affinity::Before)?;
    let late = text_point(0, 1, 1, Affinity::After)?;
    let mut results = Vec::new();
    for (lineage, anchor, focus) in [
        ("enter-range-forward", early.clone(), late.clone()),
        ("enter-range-backward", late, early),
    ] {
        let initial = state(
            &context,
            &[paragraph_value(&[("ab", false), ("CD", true)])],
            Some(selected(anchor, focus)),
            None,
            lineage,
        )?;
        let commit = execute(&registry, &initial, enter_id.clone())?;
        assert!(matches!(
            commit.forward_operations(),
            [Operation::ParagraphSplit(_), Operation::TextSplice(_)]
        ));
        assert_paragraph_runs(commit.after().document(), 0, &[("a", false)])?;
        assert_paragraph_runs(commit.after().document(), 1, &[("D", true)])?;
        assert_exact_caret(
            commit.after(),
            &Point::Children {
                parent_path: path(&[1])?,
                child_index: 0,
                affinity: Affinity::After,
            },
        )?;
        results.push((commit.after().document().clone(), commit.after().selection().cloned()));
    }
    assert_eq!(results[0], results[1]);

    let limited = EditorContext::default().with_max_operations_per_transaction(1);
    let limited_state = state(
        &limited,
        &[paragraph_value(&[("ab", false), ("CD", true)])],
        Some(selected(
            text_point(0, 0, 1, Affinity::Before)?,
            text_point(0, 1, 1, Affinity::After)?,
        )),
        None,
        "enter-range-budget",
    )?;
    assert_disabled(&registry, &limited_state, enter_id, "breditor/operation-budget-exceeded")?;
    Ok(())
}

#[test]
fn enter_explicitly_preserves_pending_formats_and_records_history() -> TestResult {
    let registry = base_action_registry()?;
    let enter_id = insert_paragraph_break_action_id();
    let context = EditorContext::default();
    let pending = strong_formats()?;
    let initial = state(
        &context,
        &[paragraph_value(&[("ab", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::Before)?)),
        Some(pending.clone()),
        "enter-pending",
    )?;
    let prepared = prepared(&registry, &initial, enter_id.clone())?;
    let commit = prepared.execute(&initial)?;
    assert_eq!(commit.after().pending_formats(), Some(&pending));
    assert_action_metadata(&commit, &enter_id, &HistoryIntent::Record);
    assert_exact_caret(
        commit.after(),
        &Point::Children { parent_path: path(&[1])?, child_index: 0, affinity: Affinity::After },
    )?;
    Ok(())
}

#[test]
fn delete_backward_removes_one_ascii_non_bmp_or_combining_scalar_and_crosses_run_seams()
-> TestResult {
    struct Case {
        lineage: &'static str,
        source: Vec<(&'static str, bool)>,
        caret: Point,
        result: Vec<(&'static str, bool)>,
        result_caret: Point,
    }
    let cases = vec![
        Case {
            lineage: "delete-ascii",
            source: vec![("ab", false)],
            caret: text_point(0, 0, 2, Affinity::Before)?,
            result: vec![("a", false)],
            result_caret: text_point(0, 0, 1, Affinity::After)?,
        },
        Case {
            lineage: "delete-non-bmp",
            source: vec![("a😀", false)],
            caret: text_point(0, 0, 3, Affinity::Before)?,
            result: vec![("a", false)],
            result_caret: text_point(0, 0, 1, Affinity::After)?,
        },
        Case {
            lineage: "delete-combining-scalar",
            source: vec![("e\u{301}", false)],
            caret: text_point(0, 0, 2, Affinity::Before)?,
            result: vec![("e", false)],
            result_caret: text_point(0, 0, 1, Affinity::After)?,
        },
        Case {
            lineage: "delete-run-seam",
            source: vec![("a", false), ("B", true)],
            caret: child_point(0, 1, Affinity::Before)?,
            result: vec![("B", true)],
            result_caret: text_point(0, 0, 0, Affinity::After)?,
        },
    ];
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let delete_id = delete_backward_action_id();
    let history = HistoryIntent::Merge { group: delete_id.qualified_name().clone() };
    for case in cases {
        let pending = strong_formats()?;
        let initial = state(
            &context,
            &[paragraph_value(&case.source)],
            Some(collapsed(case.caret)),
            Some(pending.clone()),
            case.lineage,
        )?;
        let commit = execute(&registry, &initial, delete_id.clone())?;
        assert!(matches!(commit.forward_operations(), [Operation::TextSplice(_)]));
        assert_paragraph_runs(commit.after().document(), 0, &case.result)?;
        assert_exact_caret(commit.after(), &case.result_caret)?;
        assert_eq!(commit.after().pending_formats(), Some(&pending));
        assert_action_metadata(&commit, &delete_id, &history);
    }
    Ok(())
}

#[test]
fn delete_backward_removes_forward_and_backward_ranges_and_canonicalizes_seams() -> TestResult {
    let registry = base_action_registry()?;
    let delete_id = delete_backward_action_id();
    let context = EditorContext::default();
    let early = text_point(0, 0, 1, Affinity::Before)?;
    let late = text_point(0, 2, 1, Affinity::After)?;
    let mut results = Vec::new();
    for (lineage, anchor, focus) in [
        ("delete-range-forward", early.clone(), late.clone()),
        ("delete-range-backward", late, early),
    ] {
        let initial = state(
            &context,
            &[paragraph_value(&[("ab", false), ("CD", true), ("ef", false)])],
            Some(selected(anchor, focus)),
            None,
            lineage,
        )?;
        let commit = execute(&registry, &initial, delete_id.clone())?;
        assert!(matches!(commit.forward_operations(), [Operation::TextSplice(_)]));
        assert_paragraph_runs(commit.after().document(), 0, &[("af", false)])?;
        assert_exact_caret(commit.after(), &text_point(0, 0, 1, Affinity::After)?)?;
        assert_eq!(commit.after().pending_formats(), None);
        results.push((commit.after().document().clone(), commit.after().selection().cloned()));
    }
    assert_eq!(results[0], results[1]);
    Ok(())
}

#[test]
fn delete_backward_at_paragraph_start_joins_empty_equal_and_unequal_seams() -> TestResult {
    struct Case {
        lineage: &'static str,
        left: Vec<(&'static str, bool)>,
        right: Vec<(&'static str, bool)>,
        result: Vec<(&'static str, bool)>,
        caret: Point,
    }
    let cases = vec![
        Case {
            lineage: "delete-join-equal",
            left: vec![("a", false)],
            right: vec![("b", false)],
            result: vec![("ab", false)],
            caret: text_point(0, 0, 1, Affinity::After)?,
        },
        Case {
            lineage: "delete-join-unequal",
            left: vec![("a", false)],
            right: vec![("B", true)],
            result: vec![("a", false), ("B", true)],
            caret: text_point(0, 1, 0, Affinity::After)?,
        },
        Case {
            lineage: "delete-join-empty-left",
            left: vec![],
            right: vec![("B", true)],
            result: vec![("B", true)],
            caret: text_point(0, 0, 0, Affinity::After)?,
        },
        Case {
            lineage: "delete-join-empty-right",
            left: vec![("a", false)],
            right: vec![],
            result: vec![("a", false)],
            caret: text_point(0, 0, 1, Affinity::After)?,
        },
    ];
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let delete_id = delete_backward_action_id();
    let pending = strong_formats()?;
    let history = HistoryIntent::Merge { group: delete_id.qualified_name().clone() };
    for case in cases {
        let initial = state(
            &context,
            &[paragraph_value(&case.left), paragraph_value(&case.right)],
            Some(collapsed(child_point(1, 0, Affinity::Before)?)),
            Some(pending.clone()),
            case.lineage,
        )?;
        let commit = execute(&registry, &initial, delete_id.clone())?;
        assert!(matches!(commit.forward_operations(), [Operation::ParagraphJoin(_)]));
        assert_paragraph_count(commit.after().document(), 1)?;
        assert_paragraph_runs(commit.after().document(), 0, &case.result)?;
        assert_exact_caret(commit.after(), &case.caret)?;
        assert_eq!(commit.after().pending_formats(), Some(&pending));
        assert_action_metadata(&commit, &delete_id, &history);
    }
    Ok(())
}

#[test]
fn builtins_support_nonzero_paragraphs_and_opposing_affinity_point_aliases() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let enter_state = state(
        &context,
        &[
            paragraph_value(&[("prefix", false)]),
            paragraph_value(&[("a", false), ("B", true)]),
            paragraph_value(&[("suffix", false)]),
        ],
        Some(selected(text_point(1, 0, 1, Affinity::Before)?, child_point(1, 1, Affinity::After)?)),
        None,
        "enter-nonzero-alias",
    )?;
    let enter = execute(&registry, &enter_state, insert_paragraph_break_action_id())?;
    assert_paragraph_count(enter.after().document(), 4)?;
    assert_paragraph_runs(enter.after().document(), 0, &[("prefix", false)])?;
    assert_paragraph_runs(enter.after().document(), 1, &[("a", false)])?;
    assert_paragraph_runs(enter.after().document(), 2, &[("B", true)])?;
    assert_paragraph_runs(enter.after().document(), 3, &[("suffix", false)])?;
    assert_exact_caret(
        enter.after(),
        &Point::Children { parent_path: path(&[2])?, child_index: 0, affinity: Affinity::After },
    )?;

    let join_state = state(
        &context,
        &[
            paragraph_value(&[("prefix", false)]),
            paragraph_value(&[("a", false)]),
            paragraph_value(&[("B", true)]),
            paragraph_value(&[("suffix", false)]),
        ],
        Some(selected(child_point(2, 0, Affinity::Before)?, text_point(2, 0, 0, Affinity::After)?)),
        None,
        "delete-join-nonzero-alias",
    )?;
    let join = execute(&registry, &join_state, delete_backward_action_id())?;
    assert_paragraph_count(join.after().document(), 3)?;
    assert_paragraph_runs(join.after().document(), 0, &[("prefix", false)])?;
    assert_paragraph_runs(join.after().document(), 1, &[("a", false), ("B", true)])?;
    assert_paragraph_runs(join.after().document(), 2, &[("suffix", false)])?;
    assert_exact_caret(join.after(), &text_point(1, 1, 0, Affinity::After)?)?;
    Ok(())
}

#[test]
fn builtins_report_stable_disabled_reasons_without_changing_state_or_revision() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let delete_id = delete_backward_action_id();
    let enter_id = insert_paragraph_break_action_id();
    let strong_id = toggle_strong_action_id();

    let document_start = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 0, Affinity::After)?)),
        Some(strong_formats()?),
        "disabled-document-start",
    )?;
    assert_disabled(&registry, &document_start, delete_id.clone(), "breditor/at-document-start")?;

    let no_selection =
        state(&context, &[paragraph_value(&[("a", false)])], None, None, "disabled-no-selection")?;
    for id in [delete_id.clone(), enter_id.clone(), strong_id.clone()] {
        assert_disabled(&registry, &no_selection, id, "breditor/no-selection")?;
    }

    let cross_paragraph = state(
        &context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("b", false)])],
        Some(selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(1, 0, 0, Affinity::After)?,
        )),
        None,
        "disabled-cross-paragraph",
    )?;
    for id in [delete_id.clone(), enter_id.clone(), strong_id] {
        assert_disabled(&registry, &cross_paragraph, id, "breditor/cross-paragraph-selection")?;
    }

    let no_operations = EditorContext::default().with_max_operations_per_transaction(0);
    let no_budget = state(
        &no_operations,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "disabled-operation-budget",
    )?;
    for id in [delete_id, enter_id] {
        assert_disabled(&registry, &no_budget, id, "breditor/operation-budget-exceeded")?;
    }
    Ok(())
}

#[test]
fn enter_selects_a_valid_intermediate_order_and_disables_only_unrepresentable_routes() -> TestResult
{
    let registry = base_action_registry()?;
    let enter_id = insert_paragraph_break_action_id();
    let selection = || -> Result<Selection, Box<dyn Error>> {
        Ok(selected(text_point(0, 1, 0, Affinity::Before)?, text_point(0, 1, 1, Affinity::After)?))
    };

    let leaf_limited = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(2),
    );
    let leaf_state = state(
        &leaf_limited,
        &[paragraph_value(&[("aa", false), ("B", true), ("cc", false)])],
        Some(selection()?),
        None,
        "enter-split-first-for-leaf-limit",
    )?;
    let leaf_commit = execute(&registry, &leaf_state, enter_id.clone())?;
    assert!(matches!(
        leaf_commit.forward_operations(),
        [Operation::ParagraphSplit(_), Operation::TextSplice(_)]
    ));
    assert_paragraph_runs(leaf_commit.after().document(), 0, &[("aa", false)])?;
    assert_paragraph_runs(leaf_commit.after().document(), 1, &[("cc", false)])?;

    let node_limited = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_nodes(5),
    );
    let node_state = state(
        &node_limited,
        &[paragraph_value(&[("a", false), ("B", true), ("c", false)])],
        Some(selection()?),
        None,
        "enter-delete-first-for-node-limit",
    )?;
    let node_commit = execute(&registry, &node_state, enter_id.clone())?;
    assert!(matches!(
        node_commit.forward_operations(),
        [Operation::TextSplice(_), Operation::ParagraphSplit(_)]
    ));
    assert_paragraph_runs(node_commit.after().document(), 0, &[("a", false)])?;
    assert_paragraph_runs(node_commit.after().document(), 1, &[("c", false)])?;

    let no_intermediate = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_nodes(5).with_max_text_bytes(1),
    );
    let no_intermediate_state = state(
        &no_intermediate,
        &[paragraph_value(&[("a", false), ("B", true), ("c", false)])],
        Some(selection()?),
        None,
        "enter-no-valid-intermediate",
    )?;
    assert_disabled(
        &registry,
        &no_intermediate_state,
        enter_id,
        "breditor/intermediate-limit-exceeded",
    )?;
    Ok(())
}

#[test]
fn builtins_report_result_capacity_as_disabled_capability() -> TestResult {
    let registry = base_action_registry()?;
    let enter_id = insert_paragraph_break_action_id();
    let delete_id = delete_backward_action_id();

    let root_limited = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(1),
    );
    let root_state = state(
        &root_limited,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "enter-root-capacity",
    )?;
    assert_disabled(&registry, &root_state, enter_id.clone(), "breditor/result-limit-exceeded")?;

    let node_limited = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_nodes(3),
    );
    let node_state = state(
        &node_limited,
        &[paragraph_value(&[("ab", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "enter-node-capacity",
    )?;
    assert_disabled(&registry, &node_state, enter_id, "breditor/result-limit-exceeded")?;

    let child_limited = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(2),
    );
    let child_state = state(
        &child_limited,
        &[
            paragraph_value(&[("a", false), ("B", true)]),
            paragraph_value(&[("c", false), ("D", true)]),
        ],
        Some(collapsed(child_point(1, 0, Affinity::Before)?)),
        None,
        "delete-join-child-capacity",
    )?;
    assert_disabled(&registry, &child_state, delete_id.clone(), "breditor/result-limit-exceeded")?;

    let leaf_limited = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(2),
    );
    let join_state = state(
        &leaf_limited,
        &[paragraph_value(&[("aa", false)]), paragraph_value(&[("bb", false)])],
        Some(collapsed(child_point(1, 0, Affinity::Before)?)),
        None,
        "delete-join-leaf-capacity",
    )?;
    assert_disabled(&registry, &join_state, delete_id.clone(), "breditor/result-limit-exceeded")?;

    let range_state = state(
        &leaf_limited,
        &[paragraph_value(&[("aa", false), ("B", true), ("cc", false)])],
        Some(selected(
            text_point(0, 1, 0, Affinity::Before)?,
            text_point(0, 1, 1, Affinity::After)?,
        )),
        None,
        "delete-range-leaf-capacity",
    )?;
    assert_disabled(&registry, &range_state, delete_id, "breditor/result-limit-exceeded")?;
    Ok(())
}

#[test]
fn builtin_commits_undo_and_redo_exact_document_selection_and_pending_formats() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let pending = strong_formats()?;
    let cases = [
        (
            "history-enter",
            insert_paragraph_break_action_id(),
            text_point(0, 0, 1, Affinity::Before)?,
        ),
        ("history-delete", delete_backward_action_id(), text_point(0, 0, 2, Affinity::Before)?),
    ];
    for (lineage, id, caret) in cases {
        let initial = state(
            &context,
            &[paragraph_value(&[("ab", false)])],
            Some(collapsed(caret)),
            Some(pending.clone()),
            lineage,
        )?;
        let action = execute(&registry, &initial, id)?;
        let action_result = action.after().clone();
        let undo =
            committed(action.undo_transaction(action.after())?.apply(&context, action.after())?)?;
        assert_eq!(undo.after().document(), initial.document());
        assert_eq!(undo.after().selection(), initial.selection());
        assert_eq!(undo.after().pending_formats(), initial.pending_formats());
        assert_eq!(undo.revision(), Revision::new(2));

        let redo =
            committed(action.redo_transaction(undo.after())?.apply(&context, undo.after())?)?;
        assert_eq!(redo.after().document(), action_result.document());
        assert_eq!(redo.after().selection(), action_result.selection());
        assert_eq!(redo.after().pending_formats(), action_result.pending_formats());
        assert_eq!(redo.revision(), Revision::new(3));
    }

    let extended_enter = state(
        &context,
        &[paragraph_value(&[("ab", false), ("CD", true)])],
        Some(selected(
            text_point(0, 0, 1, Affinity::Before)?,
            text_point(0, 1, 1, Affinity::After)?,
        )),
        None,
        "history-extended-enter",
    )?;
    assert_action_round_trip(
        &registry,
        &context,
        &extended_enter,
        insert_paragraph_break_action_id(),
    )?;

    let paragraph_join = state(
        &context,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("B", true)])],
        Some(collapsed(child_point(1, 0, Affinity::Before)?)),
        Some(pending),
        "history-paragraph-join",
    )?;
    assert_action_round_trip(&registry, &context, &paragraph_join, delete_backward_action_id())?;
    Ok(())
}

fn assert_action_round_trip(
    registry: &ActionRegistry,
    context: &EditorContext,
    initial: &EditorState,
    id: ActionId,
) -> TestResult {
    let action = execute(registry, initial, id)?;
    let action_result = action.after().clone();
    let undo = committed(action.undo_transaction(action.after())?.apply(context, action.after())?)?;
    assert_eq!(undo.after().document(), initial.document());
    assert_eq!(undo.after().selection(), initial.selection());
    assert_eq!(undo.after().pending_formats(), initial.pending_formats());
    let redo = committed(action.redo_transaction(undo.after())?.apply(context, undo.after())?)?;
    assert_eq!(redo.after().document(), action_result.document());
    assert_eq!(redo.after().selection(), action_result.selection());
    assert_eq!(redo.after().pending_formats(), action_result.pending_formats());
    Ok(())
}
