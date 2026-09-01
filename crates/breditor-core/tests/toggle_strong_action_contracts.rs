//! Black-box contracts for the built-in strong-format action.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionInvocation, ActionPreparation, ActionRegistry, ActionStateBatch,
        ActionStateCache, ActionStateCacheUpdate, ActionStateCatalog, ActionStateDomains,
        ActionStateId, ActionStateOutcome, ActionStateRegistration, ActionStateSource,
        ObservedAvailability, PreparedAction, ResolvedActionState,
        builtins::{base_action_registry, toggle_strong_action_id},
    },
    codec::DocumentJsonCodec,
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{Operation, TextRange, TextSplice},
    position::{Affinity, Point, TextOffset},
    schema::DocumentLimits,
    selection::{RangeOrder, RangeSelection, ResolvedSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{
        HistoryIntent, SelectionUpdate, Transaction, TransactionMetadata, TransactionOutcome,
    },
};
use serde_json::Value;
use support::{TestResult, document_json, paragraph, path, test_error, text_node};

fn strong_formats() -> Result<FormatSet, Box<dyn Error>> {
    Ok(FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])?)
}

fn formats(strong: bool) -> Result<FormatSet, Box<dyn Error>> {
    if strong { strong_formats() } else { Ok(FormatSet::default()) }
}

fn fragment(runs: &[(&str, bool)]) -> Result<TextFragment, Box<dyn Error>> {
    let runs = runs
        .iter()
        .map(|(text, strong)| TextRun::try_new(*text, formats(*strong)?).map_err(Into::into))
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    TextFragment::try_from_runs(runs).map_err(Into::into)
}

fn paragraph_value(runs: &[(&str, bool)]) -> Value {
    paragraph(&runs.iter().map(|(text, strong)| text_node(text, *strong)).collect::<Vec<_>>())
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    selection: Selection,
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
        Some(selection),
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
            "toggle-strong unexpectedly disabled: {}",
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
    let ActionPreparation::Disabled(prepared) = prepare(registry, state)? else {
        return Err(test_error(format!("expected disabled reason {expected_code}")).into());
    };
    assert_eq!(prepared.reason().code().as_str(), expected_code);
    assert_eq!(prepared.reason().detail(), None);
    assert_eq!(prepared.indicator().activation(), expected_activation);
    assert_eq!(prepared.base_state(), state);
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

fn assert_exact_range(state: &EditorState, anchor: &Point, focus: &Point) -> TestResult {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(test_error("state did not contain a range selection").into());
    };
    assert_eq!(range.anchor(), anchor);
    assert_eq!(range.focus(), focus);
    Ok(())
}

fn assert_fragment(actual: &TextFragment, expected: &[(&str, bool)]) -> TestResult {
    assert_eq!(actual, &fragment(expected)?);
    Ok(())
}

fn only_splice(operations: &[Operation]) -> Result<&TextSplice, Box<dyn Error>> {
    let [Operation::TextSplice(splice)] = operations else {
        return Err(
            test_error(format!("expected exactly one text splice, got {operations:?}")).into()
        );
    };
    Ok(splice)
}

fn committed(
    outcome: TransactionOutcome,
) -> Result<breditor_core::transaction::Commit, Box<dyn Error>> {
    outcome.into_commit().ok_or_else(|| test_error("transaction unexpectedly unchanged").into())
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
fn collapsed_context_uses_focus_affinity_aliases_and_explicit_pending_precedence() -> TestResult {
    struct Case {
        lineage: &'static str,
        runs: Vec<(&'static str, bool)>,
        selection: Selection,
        pending: Option<FormatSet>,
        activation: ActionActivation,
        toggled_strong: bool,
    }

    let seam_runs = || vec![("ab", false), ("CD", true)];
    let mut cases = vec![
        Case {
            lineage: "strong-collapsed-empty",
            runs: vec![],
            selection: collapsed(child_point(0, 0, Affinity::Before)?),
            pending: None,
            activation: ActionActivation::Inactive,
            toggled_strong: true,
        },
        Case {
            lineage: "strong-collapsed-plain-interior",
            runs: vec![("ab", false)],
            selection: collapsed(text_point(0, 0, 1, Affinity::After)?),
            pending: None,
            activation: ActionActivation::Inactive,
            toggled_strong: true,
        },
        Case {
            lineage: "strong-collapsed-strong-interior",
            runs: vec![("AB", true)],
            selection: collapsed(text_point(0, 0, 1, Affinity::Before)?),
            pending: None,
            activation: ActionActivation::Active,
            toggled_strong: false,
        },
    ];

    for affinity in [Affinity::Before, Affinity::After] {
        cases.push(Case {
            lineage: match affinity {
                Affinity::Before => "strong-collapsed-start-before",
                Affinity::After => "strong-collapsed-start-after",
            },
            runs: vec![("AB", true), ("cd", false)],
            selection: collapsed(text_point(0, 0, 0, affinity)?),
            pending: None,
            activation: ActionActivation::Active,
            toggled_strong: false,
        });
        cases.push(Case {
            lineage: match affinity {
                Affinity::Before => "strong-collapsed-end-before",
                Affinity::After => "strong-collapsed-end-after",
            },
            runs: vec![("AB", true), ("cd", false)],
            selection: collapsed(text_point(0, 1, 2, affinity)?),
            pending: None,
            activation: ActionActivation::Inactive,
            toggled_strong: true,
        });
    }

    for (alias_name, alias) in [
        ("left", text_point(0, 0, 2, Affinity::Before)?),
        ("child", child_point(0, 1, Affinity::Before)?),
        ("right", text_point(0, 1, 0, Affinity::Before)?),
    ] {
        cases.push(Case {
            lineage: match alias_name {
                "left" => "strong-seam-before-left",
                "child" => "strong-seam-before-child",
                _ => "strong-seam-before-right",
            },
            runs: seam_runs(),
            selection: collapsed(alias),
            pending: None,
            activation: ActionActivation::Inactive,
            toggled_strong: true,
        });
    }
    for (alias_name, alias) in [
        ("left", text_point(0, 0, 2, Affinity::After)?),
        ("child", child_point(0, 1, Affinity::After)?),
        ("right", text_point(0, 1, 0, Affinity::After)?),
    ] {
        cases.push(Case {
            lineage: match alias_name {
                "left" => "strong-seam-after-left",
                "child" => "strong-seam-after-child",
                _ => "strong-seam-after-right",
            },
            runs: seam_runs(),
            selection: collapsed(alias),
            pending: None,
            activation: ActionActivation::Active,
            toggled_strong: false,
        });
    }

    cases.extend([
        Case {
            lineage: "strong-focus-before-wins",
            runs: seam_runs(),
            selection: selected(
                text_point(0, 1, 0, Affinity::After)?,
                text_point(0, 0, 2, Affinity::Before)?,
            ),
            pending: None,
            activation: ActionActivation::Inactive,
            toggled_strong: true,
        },
        Case {
            lineage: "strong-focus-after-wins",
            runs: seam_runs(),
            selection: selected(
                text_point(0, 0, 2, Affinity::Before)?,
                child_point(0, 1, Affinity::After)?,
            ),
            pending: None,
            activation: ActionActivation::Active,
            toggled_strong: false,
        },
        Case {
            lineage: "strong-explicit-empty-wins",
            runs: vec![("AB", true)],
            selection: collapsed(text_point(0, 0, 1, Affinity::After)?),
            pending: Some(FormatSet::default()),
            activation: ActionActivation::Inactive,
            toggled_strong: true,
        },
        Case {
            lineage: "strong-explicit-strong-wins",
            runs: vec![("ab", false)],
            selection: collapsed(text_point(0, 0, 1, Affinity::Before)?),
            pending: Some(strong_formats()?),
            activation: ActionActivation::Active,
            toggled_strong: false,
        },
    ]);

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for case in cases {
        let selection = case.selection.clone();
        let initial = state(
            &context,
            &[paragraph_value(&case.runs)],
            selection.clone(),
            case.pending,
            case.lineage,
        )?;
        let document = initial.document().clone();
        let prepared = enabled(&registry, &initial)?;
        assert_eq!(prepared.indicator().activation(), case.activation);
        assert!(prepared.transaction().operations().is_empty());
        assert_eq!(
            prepared.actual_writes(),
            ActionStateDomains::PENDING_FORMATS
                | ActionStateDomains::HISTORY
                | ActionStateDomains::SNAPSHOT
        );
        let commit = prepared.execute(&initial)?;
        assert_eq!(commit.after().document(), &document);
        assert_eq!(commit.after().selection(), Some(&selection));
        assert_eq!(commit.after().pending_formats(), Some(&formats(case.toggled_strong)?));
        assert_eq!(commit.revision(), Revision::new(1));
        assert_eq!(commit.metadata().history(), &HistoryIntent::Record);
    }
    Ok(())
}

#[test]
fn collapsed_state_only_publication_rotates_identity_without_consuming_history_or_redo()
-> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        collapsed(text_point(0, 0, 1, Affinity::After)?),
        None,
        "strong-state-only-session",
    )?;
    let mut session = EditorSession::new(initial.clone());
    let insertion_range =
        TextRange::try_new(path(&[0])?, TextOffset::try_new(1)?, TextOffset::try_new(1)?)?;
    let insertion = TextSplice::capture(
        &context,
        initial.document(),
        insertion_range,
        fragment(&[("b", false)])?,
    )?;
    let transaction = Transaction::new(session.state(), vec![Operation::from(insertion)])
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    let _ = committed(session.apply_transaction(&transaction)?)?;
    assert_eq!(session.undo_depth(), 1);
    let Some(_) = session.undo()? else {
        return Err(test_error("setup undo was unexpectedly unavailable").into());
    };
    assert_eq!(session.state().document(), initial.document());
    assert_eq!(session.undo_depth(), 0);
    assert_eq!(session.redo_depth(), 1);

    let before = session.state().clone();
    let history_before = session.history_status();
    let prepared = enabled(&registry, session.state())?;
    assert!(prepared.transaction().operations().is_empty());
    let commit = session.execute_prepared_action(ActionPreparation::Enabled(prepared))?;
    assert_eq!(commit.before(), &before);
    assert_eq!(session.state().document(), before.document());
    assert_eq!(session.state().selection(), before.selection());
    assert_eq!(session.state().pending_formats(), Some(&strong_formats()?));
    assert_eq!(session.state().snapshot().revision(), before.snapshot().revision().successor()?);
    assert_ne!(session.history_status().stamp(), history_before.stamp());
    assert_eq!(session.undo_depth(), 0);
    assert_eq!(session.redo_depth(), 1);

    let Some(redo) = session.redo()? else {
        return Err(test_error("redo was lost after a state-only toggle").into());
    };
    assert_paragraph_runs(redo.after().document(), 0, &[("ab", false)])?;
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 0);
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn extended_ranges_toggle_uniform_and_mixed_content_and_preserve_direction_affinities() -> TestResult
{
    struct Case {
        lineage: &'static str,
        source: Vec<(&'static str, bool)>,
        anchor: Point,
        focus: Point,
        activation: ActionActivation,
        result: Vec<(&'static str, bool)>,
        result_anchor: Point,
        result_focus: Point,
    }

    let cases = vec![
        Case {
            lineage: "strong-plain-partial",
            source: vec![("abcdef", false)],
            anchor: text_point(0, 0, 2, Affinity::Before)?,
            focus: text_point(0, 0, 4, Affinity::After)?,
            activation: ActionActivation::Inactive,
            result: vec![("ab", false), ("cd", true), ("ef", false)],
            result_anchor: text_point(0, 1, 0, Affinity::Before)?,
            result_focus: text_point(0, 2, 0, Affinity::After)?,
        },
        Case {
            lineage: "strong-active-seam-merge",
            source: vec![("ab", false), ("CD", true), ("ef", false)],
            anchor: text_point(0, 1, 0, Affinity::After)?,
            focus: text_point(0, 1, 2, Affinity::Before)?,
            activation: ActionActivation::Active,
            result: vec![("abCDef", false)],
            result_anchor: text_point(0, 0, 2, Affinity::After)?,
            result_focus: text_point(0, 0, 4, Affinity::Before)?,
        },
        Case {
            lineage: "strong-mixed-adds-forward",
            source: vec![("ab", false), ("CD", true), ("ef", false)],
            anchor: text_point(0, 0, 1, Affinity::Before)?,
            focus: text_point(0, 2, 1, Affinity::After)?,
            activation: ActionActivation::Mixed,
            result: vec![("a", false), ("bCDe", true), ("f", false)],
            result_anchor: text_point(0, 1, 0, Affinity::Before)?,
            result_focus: text_point(0, 2, 0, Affinity::After)?,
        },
        Case {
            lineage: "strong-mixed-adds-backward",
            source: vec![("ab", false), ("CD", true), ("ef", false)],
            anchor: text_point(0, 2, 1, Affinity::Before)?,
            focus: text_point(0, 0, 1, Affinity::After)?,
            activation: ActionActivation::Mixed,
            result: vec![("a", false), ("bCDe", true), ("f", false)],
            result_anchor: text_point(0, 2, 0, Affinity::Before)?,
            result_focus: text_point(0, 1, 0, Affinity::After)?,
        },
        Case {
            lineage: "strong-non-bmp-partial",
            source: vec![("a😀b", false)],
            anchor: text_point(0, 0, 1, Affinity::After)?,
            focus: text_point(0, 0, 3, Affinity::Before)?,
            activation: ActionActivation::Inactive,
            result: vec![("a", false), ("😀", true), ("b", false)],
            result_anchor: text_point(0, 1, 0, Affinity::After)?,
            result_focus: text_point(0, 2, 0, Affinity::Before)?,
        },
    ];

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for case in cases {
        let source_selection = selected(case.anchor, case.focus);
        let initial = state(
            &context,
            &[paragraph_value(&case.source)],
            source_selection,
            None,
            case.lineage,
        )?;
        let prepared = enabled(&registry, &initial)?;
        assert_eq!(prepared.indicator().activation(), case.activation);
        assert_eq!(prepared.transaction().operations().len(), 1);
        assert_eq!(
            prepared.transaction().pending_formats_update(),
            &breditor_core::transaction::PendingFormatsUpdate::Set(None)
        );
        let commit = prepared.execute(&initial)?;
        assert!(matches!(commit.forward_operations(), [Operation::TextSplice(_)]));
        assert_paragraph_runs(commit.after().document(), 0, &case.result)?;
        assert_exact_range(commit.after(), &case.result_anchor, &case.result_focus)?;
        let ResolvedSelection::Range(resolved) = commit
            .after()
            .selection()
            .ok_or_else(|| test_error("result selection was absent"))?
            .resolve(context.schema(), commit.after().document())?;
        let expected_order = if case.lineage.ends_with("backward") {
            RangeOrder::Backward
        } else {
            RangeOrder::Forward
        };
        assert_eq!(resolved.order(), expected_order);
        assert_eq!(commit.after().pending_formats(), None);
    }
    Ok(())
}

#[test]
fn extended_plan_is_one_exact_guarded_splice_with_canonical_fragments() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("ab", false), ("CD", true), ("ef", false)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(0, 2, 1, Affinity::After)?),
        None,
        "strong-exact-splice",
    )?;
    let prepared = enabled(&registry, &initial)?;
    let splice = only_splice(prepared.transaction().operations())?.clone();
    assert_eq!(splice.range().container_path(), &path(&[0])?);
    assert_eq!(splice.range().start(), TextOffset::try_new(1)?);
    assert_eq!(splice.range().end(), TextOffset::try_new(5)?);
    assert_fragment(splice.expected_removed(), &[("b", false), ("CD", true), ("e", false)])?;
    assert_fragment(splice.replacement(), &[("bCDe", true)])?;

    let commit = prepared.execute(&initial)?;
    let applied = only_splice(commit.forward_operations())?;
    assert_eq!(applied, &splice);
    let inverse = only_splice(commit.inverse_operations())?;
    assert_eq!(inverse.range().start(), TextOffset::try_new(1)?);
    assert_eq!(inverse.range().end(), TextOffset::try_new(5)?);
    assert_fragment(inverse.expected_removed(), &[("bCDe", true)])?;
    assert_fragment(inverse.replacement(), &[("b", false), ("CD", true), ("e", false)])?;
    Ok(())
}

#[test]
fn large_alternating_selection_canonicalizes_in_one_bounded_pass() -> TestResult {
    const RUN_COUNT: usize = 4_096;
    const RUN_BYTES: usize = 128;

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let piece = "x".repeat(RUN_BYTES);
    let children =
        (0..RUN_COUNT).map(|index| text_node(&piece, index % 2 == 1)).collect::<Vec<_>>();
    let initial = state(
        &context,
        &[paragraph(&children)],
        selected(
            text_point(0, 0, 0, Affinity::Before)?,
            text_point(
                0,
                u32::try_from(RUN_COUNT - 1)?,
                u32::try_from(RUN_BYTES)?,
                Affinity::After,
            )?,
        ),
        None,
        "strong-large-alternating",
    )?;

    let prepared = enabled(&registry, &initial)?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
    let commit = prepared.execute(&initial)?;
    let expected = piece.repeat(RUN_COUNT);
    assert_paragraph_runs(commit.after().document(), 0, &[(&expected, true)])?;
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn resource_limits_disable_before_preflight_while_zero_operation_collapsed_toggle_still_works()
-> TestResult {
    let registry = base_action_registry()?;

    let no_operations = EditorContext::default().with_max_operations_per_transaction(0);
    let collapsed_state = state(
        &no_operations,
        &[paragraph_value(&[("ab", false)])],
        collapsed(text_point(0, 0, 1, Affinity::After)?),
        None,
        "strong-no-op-budget-collapsed",
    )?;
    let collapsed_prepared = enabled(&registry, &collapsed_state)?;
    assert!(collapsed_prepared.transaction().operations().is_empty());
    let collapsed_commit = collapsed_prepared.execute(&collapsed_state)?;
    assert_eq!(collapsed_commit.after().pending_formats(), Some(&strong_formats()?));

    let extended_state = state(
        &no_operations,
        &[paragraph_value(&[("ab", false)])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 2, Affinity::After)?),
        None,
        "strong-no-op-budget-extended",
    )?;
    assert_disabled(
        &registry,
        &extended_state,
        "breditor/operation-budget-exceeded",
        ActionActivation::Inactive,
    )?;

    let no_formats = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_formats_per_text(0),
    );
    let no_formats_collapsed = state(
        &no_formats,
        &[paragraph_value(&[("ab", false)])],
        collapsed(text_point(0, 0, 1, Affinity::After)?),
        None,
        "strong-no-format-collapsed",
    )?;
    assert_disabled(
        &registry,
        &no_formats_collapsed,
        "breditor/result-limit-exceeded",
        ActionActivation::Inactive,
    )?;
    let no_formats_extended = state(
        &no_formats,
        &[paragraph_value(&[("ab", false)])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 2, Affinity::After)?),
        None,
        "strong-no-format-extended",
    )?;
    assert_disabled(
        &registry,
        &no_formats_extended,
        "breditor/result-limit-exceeded",
        ActionActivation::Inactive,
    )?;

    let child_limited = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(2),
    );
    let child_state = state(
        &child_limited,
        &[paragraph_value(&[("abc", false)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(0, 0, 2, Affinity::After)?),
        None,
        "strong-result-child-limit",
    )?;
    assert_disabled(
        &registry,
        &child_state,
        "breditor/result-limit-exceeded",
        ActionActivation::Inactive,
    )?;

    let node_limited = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_nodes(4),
    );
    let node_state = state(
        &node_limited,
        &[paragraph_value(&[("abc", false)])],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(0, 0, 2, Affinity::After)?),
        None,
        "strong-result-node-limit",
    )?;
    assert_disabled(
        &registry,
        &node_state,
        "breditor/result-limit-exceeded",
        ActionActivation::Inactive,
    )?;

    let leaf_limited = EditorContext::new(
        breditor_core::schema::CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(2),
    );
    let leaf_state = state(
        &leaf_limited,
        &[paragraph_value(&[("aa", false), ("BB", true), ("cc", false)])],
        selected(text_point(0, 1, 0, Affinity::Before)?, text_point(0, 1, 2, Affinity::After)?),
        None,
        "strong-result-leaf-limit",
    )?;
    assert_disabled(
        &registry,
        &leaf_state,
        "breditor/result-limit-exceeded",
        ActionActivation::Active,
    )?;
    Ok(())
}

#[test]
fn cross_paragraph_ranges_are_disabled_with_truthful_activation() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for (lineage, first_strong, second_strong, expected) in [
        ("strong-cross-inactive", false, false, ActionActivation::Inactive),
        ("strong-cross-active", true, true, ActionActivation::Active),
        ("strong-cross-mixed", false, true, ActionActivation::Mixed),
    ] {
        let initial = state(
            &context,
            &[paragraph_value(&[("a", first_strong)]), paragraph_value(&[("B", second_strong)])],
            selected(text_point(0, 0, 0, Affinity::Before)?, text_point(1, 0, 1, Affinity::After)?),
            None,
            lineage,
        )?;
        assert_disabled(&registry, &initial, "breditor/cross-paragraph-selection", expected)?;
    }

    let backward = state(
        &context,
        &[paragraph_value(&[("za", false)]), paragraph_value(&[("Bz", true)])],
        selected(text_point(1, 0, 1, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        None,
        "strong-cross-mixed-backward",
    )?;
    assert_disabled(
        &registry,
        &backward,
        "breditor/cross-paragraph-selection",
        ActionActivation::Mixed,
    )?;

    let empty = state(
        &context,
        &[paragraph_value(&[]), paragraph_value(&[])],
        selected(child_point(0, 0, Affinity::Before)?, child_point(1, 0, Affinity::After)?),
        None,
        "strong-cross-empty",
    )?;
    assert_disabled(
        &registry,
        &empty,
        "breditor/cross-paragraph-selection",
        ActionActivation::Inactive,
    )?;
    Ok(())
}

#[test]
fn extended_toggle_is_one_exact_undo_unit_and_replays_complete_boundaries() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("ab", false), ("CD", true), ("ef", false)])],
        selected(text_point(0, 2, 1, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        None,
        "strong-session-replay",
    )?;
    let mut session = EditorSession::new(initial.clone());
    let prepared = enabled(&registry, session.state())?;
    assert_eq!(prepared.indicator().activation(), ActionActivation::Mixed);
    let action_commit = session.execute_prepared_action(ActionPreparation::Enabled(prepared))?;
    let result = action_commit.after().clone();
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 0);

    let Some(undo) = session.undo()? else {
        return Err(test_error("toggle undo was unexpectedly unavailable").into());
    };
    assert_eq!(undo.after().document(), initial.document());
    assert_eq!(undo.after().selection(), initial.selection());
    assert_eq!(undo.after().pending_formats(), initial.pending_formats());
    assert_eq!(session.undo_depth(), 0);
    assert_eq!(session.redo_depth(), 1);

    let Some(redo) = session.redo()? else {
        return Err(test_error("toggle redo was unexpectedly unavailable").into());
    };
    assert_eq!(redo.after().document(), result.document());
    assert_eq!(redo.after().selection(), result.selection());
    assert_eq!(redo.after().pending_formats(), result.pending_formats());
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 0);
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn catalog_and_cache_publish_inactive_mixed_active_transitions_with_exact_ids_and_domains()
-> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false), ("B", true), ("c", false)])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        None,
        "strong-cache-transitions",
    )?;
    let observable_id = state_id("test/toggle-strong-control")?;
    let catalog = ActionStateCatalog::try_new(
        registry,
        vec![ActionStateRegistration::new(
            observable_id.clone(),
            ActionStateSource::direct(invocation()),
        )],
    )?;
    let descriptor = catalog
        .descriptor(&observable_id)
        .ok_or_else(|| test_error("toggle descriptor was missing"))?;
    assert_eq!(
        descriptor.effects().reads(),
        ActionStateDomains::DOCUMENT
            | ActionStateDomains::SELECTION
            | ActionStateDomains::PENDING_FORMATS
            | ActionStateDomains::CONTEXT
            | ActionStateDomains::SNAPSHOT
    );
    assert_eq!(
        descriptor.effects().may_write(),
        ActionStateDomains::DOCUMENT
            | ActionStateDomains::SELECTION
            | ActionStateDomains::PENDING_FORMATS
            | ActionStateDomains::HISTORY
            | ActionStateDomains::SNAPSHOT
    );

    let mut session = EditorSession::new(initial);
    let mut cache = ActionStateCache::new(catalog);
    let first = cache.refresh(&session)?;
    assert!(first.is_full());
    let first_observation = first.observation().clone();
    let first_state = resolved(first_observation.batch(), &observable_id)?;
    assert!(matches!(first_state.availability(), ObservedAvailability::Enabled));
    assert_eq!(first_state.indicator().activation(), ActionActivation::Inactive);

    let mixed_selection =
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 1, 1, Affinity::After)?);
    let mixed_transaction = Transaction::new(session.state(), Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(mixed_selection)));
    let _ = committed(session.apply_transaction(&mixed_transaction)?)?;
    let mixed = cache.refresh(&session)?;
    assert!(mixed.is_delta());
    let mixed_delta = mixed.delta().ok_or_else(|| test_error("mixed update omitted its delta"))?;
    assert_eq!(mixed_delta.prior_id(), first_observation.id());
    assert_eq!(mixed_delta.new_id(), mixed.observation().id());
    assert_eq!(mixed_delta.changed_ids(), std::slice::from_ref(&observable_id));
    assert_eq!(
        mixed_delta.changed_basis_domains(),
        ActionStateDomains::SELECTION | ActionStateDomains::SNAPSHOT | ActionStateDomains::HISTORY
    );
    assert_eq!(
        resolved(mixed.observation().batch(), &observable_id)?.indicator().activation(),
        ActionActivation::Mixed
    );
    let mixed_observation = mixed.observation().clone();

    let active_selection =
        selected(text_point(0, 1, 0, Affinity::Before)?, text_point(0, 1, 1, Affinity::After)?);
    let active_transaction = Transaction::new(session.state(), Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(active_selection)));
    let _ = committed(session.apply_transaction(&active_transaction)?)?;
    let active = cache.refresh(&session)?;
    let active_delta =
        active.delta().ok_or_else(|| test_error("active update omitted its delta"))?;
    assert_ne!(first_observation.id(), mixed_observation.id());
    assert_ne!(mixed_observation.id(), active.observation().id());
    assert_eq!(active_delta.prior_id(), mixed_observation.id());
    assert_eq!(active_delta.new_id(), active.observation().id());
    assert_eq!(active_delta.changed_ids(), std::slice::from_ref(&observable_id));
    assert_eq!(
        active_delta.changed_basis_domains(),
        ActionStateDomains::SELECTION | ActionStateDomains::SNAPSHOT | ActionStateDomains::HISTORY
    );
    assert_eq!(
        resolved(active.observation().batch(), &observable_id)?.indicator().activation(),
        ActionActivation::Active
    );
    assert_eq!(active.observation().batch().base_state(), session.state());

    let unchanged = cache.refresh(&session)?;
    assert!(matches!(unchanged, ActionStateCacheUpdate::Unchanged { .. }));
    assert_eq!(unchanged.observation().id(), active.observation().id());
    Ok(())
}
