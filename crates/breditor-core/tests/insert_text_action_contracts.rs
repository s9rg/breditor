//! Black-box contracts for the built-in semantic text-insertion action.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionInput, ActionInputContract, ActionInputError, ActionInputVersion,
        ActionInvocation, ActionPreparation, ActionPrepareError, ActionRegistry, ActionStateBatch,
        ActionStateCatalog, ActionStateCatalogError, ActionStateDomains, ActionStateId,
        ActionStateOutcome, ActionStateRegistration, ActionStateSource, ActionValue,
        ActionValueError, DecodeActionInput, MAX_ACTION_VALUE_TEXT_BYTES, PreparedAction,
        ResolvedActionState,
        builtins::{
            INSERT_TEXT_ACTION_NAME, INSERT_TEXT_EMPTY_INPUT_CODE, INSERT_TEXT_HISTORY_GROUP_NAME,
            INSERT_TEXT_INPUT_CONTRACT_NAME, INSERT_TEXT_INPUT_NOT_STRING_CODE,
            INSERT_TEXT_INPUT_VERSION, InsertTextInput, InsertTextInputError,
            MAX_INSERT_TEXT_BYTES, MAX_INSERT_TEXT_UTF16_CODE_UNITS, base_action_registry,
            insert_text_action_id, insert_text_input_contract,
        },
    },
    codec::DocumentJsonCodec,
    document::{Document, Format, FormatSet, PropertyInteger, PropertyMap, TextFragment, TextRun},
    identity::QualifiedName,
    operation::{Operation, TextRange, TextSplice},
    position::{Affinity, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits},
    selection::{RangeSelection, ResolvedSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId, Revision},
    transaction::{
        HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction, TransactionMetadata,
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
            "insert-text unexpectedly disabled: {}",
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
    assert_eq!(prepared.base_state(), state);
    assert_eq!(state, &original);
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
fn typed_contract_is_a_bounded_bare_string_and_debug_redacts_it() -> TestResult {
    let registry = base_action_registry()?;
    let action = insert_text_action_id();
    let contract = insert_text_input_contract();
    assert_eq!(action.as_str(), INSERT_TEXT_ACTION_NAME);
    assert_eq!(contract.name().as_str(), INSERT_TEXT_INPUT_CONTRACT_NAME);
    assert_eq!(contract.version(), INSERT_TEXT_INPUT_VERSION);
    assert_eq!(contract.version().get(), 1);
    assert_eq!(
        registry.descriptor(&action).and_then(|descriptor| descriptor.input_contract()),
        Some(&contract)
    );

    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "insert-input-contract",
    )?;
    assert_eq!(
        registry.prepare(&initial, &ActionInvocation::without_input(action.clone())).err(),
        Some(ActionPrepareError::InvalidInput {
            id: action.clone(),
            source: ActionInputError::ExpectedTyped { expected: contract.clone() },
        })
    );

    let version_two = ActionInputContract::new(
        QualifiedName::try_new(INSERT_TEXT_INPUT_CONTRACT_NAME)?,
        ActionInputVersion::try_new(2)?,
    );
    assert_eq!(
        registry
            .prepare(
                &initial,
                &ActionInvocation::new(
                    action.clone(),
                    ActionInput::typed(version_two.clone(), ActionValue::try_from_string("x")?),
                ),
            )
            .err(),
        Some(ActionPrepareError::InvalidInput {
            id: action.clone(),
            source: ActionInputError::ContractMismatch {
                expected: contract.clone(),
                actual: version_two,
            },
        })
    );

    for invalid_value in [
        ActionValue::null(),
        ActionValue::boolean(true),
        ActionValue::from_integer(PropertyInteger::try_new(7)?),
        ActionValue::try_array(vec![ActionValue::try_from_string("array wrappers are not v1")?])?,
        ActionValue::try_object(vec![(
            "text".to_owned(),
            ActionValue::try_from_string("object wrappers are not v1")?,
        )])?,
    ] {
        assert_eq!(
            registry
                .prepare(
                    &initial,
                    &ActionInvocation::new(
                        action.clone(),
                        ActionInput::typed(contract.clone(), invalid_value),
                    ),
                )
                .err(),
            Some(ActionPrepareError::InvalidInput {
                id: action.clone(),
                source: ActionInputError::InvalidValue {
                    code: QualifiedName::try_new(INSERT_TEXT_INPUT_NOT_STRING_CODE)?,
                },
            })
        );
    }

    assert_eq!(
        registry
            .prepare(
                &initial,
                &ActionInvocation::new(
                    action.clone(),
                    ActionInput::typed(contract.clone(), ActionValue::try_from_string("")?),
                ),
            )
            .err(),
        Some(ActionPrepareError::InvalidInput {
            id: action,
            source: ActionInputError::InvalidValue {
                code: QualifiedName::try_new(INSERT_TEXT_EMPTY_INPUT_CODE)?,
            },
        })
    );
    assert_eq!(InsertTextInput::try_new(""), Err(InsertTextInputError::Empty));

    let maximum = usize::try_from(MAX_INSERT_TEXT_BYTES)?;
    assert_eq!(MAX_INSERT_TEXT_BYTES, MAX_ACTION_VALUE_TEXT_BYTES);
    assert_eq!(u64::from(MAX_INSERT_TEXT_UTF16_CODE_UNITS), MAX_INSERT_TEXT_BYTES);
    let boundary_text = "x".repeat(maximum);
    let boundary = InsertTextInput::try_new(&boundary_text)?;
    assert_eq!(boundary.text_bytes(), maximum);
    assert_eq!(boundary.utf16_len(), MAX_INSERT_TEXT_UTF16_CODE_UNITS);
    assert!(matches!(
        registry.prepare(&initial, &invocation(&boundary_text)?)?,
        ActionPreparation::Enabled(_)
    ));

    let over = maximum.saturating_add(1);
    assert_eq!(
        InsertTextInput::try_new("x".repeat(over)),
        Err(InsertTextInputError::TextBytes {
            actual: u64::try_from(over)?,
            maximum: MAX_INSERT_TEXT_BYTES,
        })
    );
    assert_eq!(
        ActionValue::try_from_string("x".repeat(over)),
        Err(ActionValueError::TextBytes {
            actual: MAX_ACTION_VALUE_TEXT_BYTES + 1,
            maximum: MAX_ACTION_VALUE_TEXT_BYTES,
        })
    );

    let non_bmp = InsertTextInput::try_new("😀")?;
    assert_eq!(non_bmp.text_bytes(), 4);
    assert_eq!(non_bmp.utf16_len(), 2);
    let secret = "secret-insert-text-payload";
    let decoded = InsertTextInput::try_new(secret)?;
    let wire = ActionInput::typed(contract, ActionValue::try_from_string(secret)?);
    let request = ActionInvocation::new(insert_text_action_id(), wire.clone());
    assert_eq!(
        InsertTextInput::decode(None, &wire),
        Err(ActionInputError::MissingRegisteredContract)
    );
    let debug = format!("{decoded:?}\n{wire:?}\n{request:?}");
    assert!(!debug.contains(secret));
    assert!(debug.contains("<redacted>"));
    assert!(debug.contains(INSERT_TEXT_INPUT_CONTRACT_NAME));
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn collapsed_insertion_uses_pending_then_focus_affinity_across_point_aliases() -> TestResult {
    struct Case {
        lineage: &'static str,
        selection: Selection,
        pending: Option<FormatSet>,
        input: &'static str,
        expected: Vec<(&'static str, bool)>,
        caret: Point,
    }

    let mut cases = Vec::new();
    for (alias, point) in [
        ("left", text_point(0, 0, 2, Affinity::Before)?),
        ("child", child_point(0, 1, Affinity::Before)?),
        ("right", text_point(0, 1, 0, Affinity::Before)?),
    ] {
        cases.push(Case {
            lineage: match alias {
                "left" => "insert-seam-before-left",
                "child" => "insert-seam-before-child",
                _ => "insert-seam-before-right",
            },
            selection: collapsed(point),
            pending: None,
            input: "x",
            expected: vec![("abx", false), ("CD", true)],
            caret: text_point(0, 1, 0, Affinity::Before)?,
        });
    }
    for (alias, point) in [
        ("left", text_point(0, 0, 2, Affinity::After)?),
        ("child", child_point(0, 1, Affinity::After)?),
        ("right", text_point(0, 1, 0, Affinity::After)?),
    ] {
        cases.push(Case {
            lineage: match alias {
                "left" => "insert-seam-after-left",
                "child" => "insert-seam-after-child",
                _ => "insert-seam-after-right",
            },
            selection: collapsed(point),
            pending: None,
            input: "X",
            expected: vec![("ab", false), ("XCD", true)],
            caret: text_point(0, 1, 1, Affinity::Before)?,
        });
    }
    cases.extend([
        Case {
            lineage: "insert-focus-before-wins",
            selection: selected(
                text_point(0, 1, 0, Affinity::After)?,
                child_point(0, 1, Affinity::Before)?,
            ),
            pending: None,
            input: "x",
            expected: vec![("abx", false), ("CD", true)],
            caret: text_point(0, 1, 0, Affinity::Before)?,
        },
        Case {
            lineage: "insert-focus-after-wins",
            selection: selected(
                text_point(0, 0, 2, Affinity::Before)?,
                text_point(0, 1, 0, Affinity::After)?,
            ),
            pending: None,
            input: "X",
            expected: vec![("ab", false), ("XCD", true)],
            caret: text_point(0, 1, 1, Affinity::Before)?,
        },
        Case {
            lineage: "insert-pending-strong-first",
            selection: collapsed(text_point(0, 0, 1, Affinity::Before)?),
            pending: Some(strong_formats()?),
            input: "X",
            expected: vec![("a", false), ("X", true), ("b", false), ("CD", true)],
            caret: text_point(0, 2, 0, Affinity::Before)?,
        },
        Case {
            lineage: "insert-pending-empty-first",
            selection: collapsed(text_point(0, 1, 1, Affinity::After)?),
            pending: Some(FormatSet::default()),
            input: "x",
            expected: vec![("ab", false), ("C", true), ("x", false), ("D", true)],
            caret: text_point(0, 3, 0, Affinity::Before)?,
        },
    ]);

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for case in cases {
        let initial = state(
            &context,
            &[paragraph_value(&[("ab", false), ("CD", true)])],
            Some(case.selection),
            case.pending,
            case.lineage,
        )?;
        let prepared = enabled(&registry, &initial, case.input)?;
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
        assert_paragraph_runs(commit.after().document(), 0, &case.expected)?;
        assert_exact_caret(commit.after(), &case.caret)?;
        assert_eq!(commit.after().pending_formats(), None);
    }
    Ok(())
}

#[test]
fn published_before_caret_keeps_the_inserted_format_after_pending_is_consumed() -> TestResult {
    struct Case {
        lineage: &'static str,
        source: Vec<(&'static str, bool)>,
        pending: FormatSet,
        first: &'static str,
        second: &'static str,
        after_first: Vec<(&'static str, bool)>,
        first_caret: Point,
        after_second: Vec<(&'static str, bool)>,
        second_caret: Point,
    }

    let cases = vec![
        Case {
            lineage: "insert-before-caret-keeps-plain",
            source: vec![("ab", false), ("CD", true)],
            pending: FormatSet::default(),
            first: "x",
            second: "y",
            after_first: vec![("abx", false), ("CD", true)],
            first_caret: text_point(0, 1, 0, Affinity::Before)?,
            after_second: vec![("abxy", false), ("CD", true)],
            second_caret: text_point(0, 1, 0, Affinity::Before)?,
        },
        Case {
            lineage: "insert-before-caret-keeps-strong",
            source: vec![("AB", true), ("cd", false)],
            pending: strong_formats()?,
            first: "X",
            second: "Y",
            after_first: vec![("ABX", true), ("cd", false)],
            first_caret: text_point(0, 1, 0, Affinity::Before)?,
            after_second: vec![("ABXY", true), ("cd", false)],
            second_caret: text_point(0, 1, 0, Affinity::Before)?,
        },
    ];

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for case in cases {
        let initial = state(
            &context,
            &[paragraph_value(&case.source)],
            Some(collapsed(child_point(0, 1, Affinity::After)?)),
            Some(case.pending),
            case.lineage,
        )?;
        let mut session = EditorSession::new(initial);
        let first = registry.prepare(session.state(), &invocation(case.first)?)?;
        session.execute_prepared_action(first)?;
        assert_paragraph_runs(session.state().document(), 0, &case.after_first)?;
        assert_exact_caret(session.state(), &case.first_caret)?;
        assert_eq!(session.state().pending_formats(), None);

        let second = registry.prepare(session.state(), &invocation(case.second)?)?;
        session.execute_prepared_action(second)?;
        assert_paragraph_runs(session.state().document(), 0, &case.after_second)?;
        assert_exact_caret(session.state(), &case.second_caret)?;
        assert_eq!(session.state().pending_formats(), None);
        assert_eq!(session.undo_depth(), 1);
    }
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn extended_replacement_inherits_the_spatial_first_selected_run_and_is_exactly_guarded()
-> TestResult {
    struct Case {
        lineage: &'static str,
        selection: Selection,
        input: &'static str,
        replacement_strong: bool,
        removed: Vec<(&'static str, bool)>,
        start: u64,
        end: u64,
        expected: Vec<(&'static str, bool)>,
        caret: Point,
    }

    let cases = vec![
        Case {
            lineage: "insert-extended-forward-plain-first",
            selection: selected(
                text_point(0, 0, 1, Affinity::Before)?,
                text_point(0, 2, 1, Affinity::After)?,
            ),
            input: "x",
            replacement_strong: false,
            removed: vec![("b", false), ("CD", true), ("e", false)],
            start: 1,
            end: 5,
            expected: vec![("axf", false)],
            caret: text_point(0, 0, 2, Affinity::Before)?,
        },
        Case {
            lineage: "insert-extended-backward-plain-first",
            selection: selected(
                text_point(0, 2, 1, Affinity::Before)?,
                text_point(0, 0, 1, Affinity::After)?,
            ),
            input: "x",
            replacement_strong: false,
            removed: vec![("b", false), ("CD", true), ("e", false)],
            start: 1,
            end: 5,
            expected: vec![("axf", false)],
            caret: text_point(0, 0, 2, Affinity::Before)?,
        },
        Case {
            lineage: "insert-extended-forward-strong-first-alias",
            selection: selected(
                child_point(0, 1, Affinity::After)?,
                text_point(0, 2, 1, Affinity::Before)?,
            ),
            input: "X",
            replacement_strong: true,
            removed: vec![("CD", true), ("e", false)],
            start: 2,
            end: 5,
            expected: vec![("ab", false), ("X", true), ("f", false)],
            caret: text_point(0, 2, 0, Affinity::Before)?,
        },
        Case {
            lineage: "insert-extended-backward-strong-first-alias",
            selection: selected(
                text_point(0, 2, 1, Affinity::After)?,
                text_point(0, 1, 0, Affinity::Before)?,
            ),
            input: "X",
            replacement_strong: true,
            removed: vec![("CD", true), ("e", false)],
            start: 2,
            end: 5,
            expected: vec![("ab", false), ("X", true), ("f", false)],
            caret: text_point(0, 2, 0, Affinity::Before)?,
        },
    ];

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for case in cases {
        let initial = state(
            &context,
            &[paragraph_value(&[("ab", false), ("CD", true), ("ef", false)])],
            Some(case.selection),
            None,
            case.lineage,
        )?;
        let prepared = enabled(&registry, &initial, case.input)?;
        let splice = only_splice(prepared.transaction().operations())?;
        assert_eq!(splice.range().container_path(), &path(&[0])?);
        assert_eq!(splice.range().start(), TextOffset::try_new(case.start)?);
        assert_eq!(splice.range().end(), TextOffset::try_new(case.end)?);
        assert_eq!(splice.expected_removed(), &fragment(&case.removed)?);
        assert_eq!(splice.replacement(), &fragment(&[(case.input, case.replacement_strong)])?);
        assert_eq!(
            prepared.transaction().selection_update(),
            &SelectionUpdate::Set(Some(collapsed(case.caret.clone())))
        );
        let commit = prepared.execute(&initial)?;
        assert!(matches!(commit.forward_operations(), [Operation::TextSplice(_)]));
        assert_paragraph_runs(commit.after().document(), 0, &case.expected)?;
        assert_exact_caret(commit.after(), &case.caret)?;
        assert_eq!(commit.after().pending_formats(), None);
        let inverse = only_splice(commit.inverse_operations())?;
        assert_eq!(
            inverse.expected_removed(),
            &fragment(&[(case.input, case.replacement_strong)])?
        );
        assert_eq!(inverse.replacement(), &fragment(&case.removed)?);
    }
    Ok(())
}

#[test]
fn insertion_preserves_non_bmp_newlines_and_unicode_normalization_form() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let exact = "😀\ne\u{301}";
    let input = InsertTextInput::try_new(exact)?;
    assert_eq!(input.text(), exact);
    assert_eq!(input.utf16_len(), 5);
    let initial = state(
        &context,
        &[paragraph_value(&[])],
        Some(collapsed(child_point(0, 0, Affinity::After)?)),
        None,
        "insert-exact-unicode",
    )?;
    let commit = enabled(&registry, &initial, exact)?.execute(&initial)?;
    assert_paragraph_runs(commit.after().document(), 0, &[(exact, false)])?;
    assert_exact_caret(commit.after(), &text_point(0, 0, 5, Affinity::Before)?)?;
    let root = commit
        .after()
        .document()
        .root()
        .as_element()
        .ok_or_else(|| test_error("root was not an element"))?;
    let text = root
        .children()
        .get(0)
        .and_then(breditor_core::document::NodeRef::as_element)
        .and_then(|paragraph| paragraph.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_text)
        .ok_or_else(|| test_error("inserted text was absent"))?;
    assert_eq!(text.text(), exact);
    assert_ne!(text.text(), "😀\né");
    Ok(())
}

#[test]
fn insertion_canonicalizes_equal_format_seams_and_keeps_unequal_seams() -> TestResult {
    struct Case {
        lineage: &'static str,
        source: Vec<(&'static str, bool)>,
        selection: Selection,
        pending: Option<FormatSet>,
        input: &'static str,
        expected: Vec<(&'static str, bool)>,
    }
    let cases = vec![
        Case {
            lineage: "insert-canonical-plain-interior",
            source: vec![("ab", false)],
            selection: collapsed(text_point(0, 0, 1, Affinity::Before)?),
            pending: None,
            input: "x",
            expected: vec![("axb", false)],
        },
        Case {
            lineage: "insert-canonical-strong-interior",
            source: vec![("AB", true)],
            selection: collapsed(text_point(0, 0, 1, Affinity::After)?),
            pending: None,
            input: "X",
            expected: vec![("AXB", true)],
        },
        Case {
            lineage: "insert-keeps-pending-format-seams",
            source: vec![("ab", false)],
            selection: collapsed(text_point(0, 0, 1, Affinity::Before)?),
            pending: Some(strong_formats()?),
            input: "X",
            expected: vec![("a", false), ("X", true), ("b", false)],
        },
        Case {
            lineage: "insert-canonicalizes-both-replacement-seams",
            source: vec![("ab", false), ("CD", true), ("ef", false)],
            selection: selected(
                text_point(0, 0, 1, Affinity::Before)?,
                text_point(0, 2, 1, Affinity::After)?,
            ),
            pending: None,
            input: "x",
            expected: vec![("axf", false)],
        },
    ];

    let registry = base_action_registry()?;
    let context = EditorContext::default();
    for case in cases {
        let initial = state(
            &context,
            &[paragraph_value(&case.source)],
            Some(case.selection),
            case.pending,
            case.lineage,
        )?;
        let commit = enabled(&registry, &initial, case.input)?.execute(&initial)?;
        assert_paragraph_runs(commit.after().document(), 0, &case.expected)?;
        assert_eq!(commit.after().pending_formats(), None);
    }
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn insertion_reports_every_active_result_limit_as_disabled() -> TestResult {
    let registry = base_action_registry()?;

    let leaf_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(2),
    );
    let leaf_state = state(
        &leaf_context,
        &[paragraph_value(&[("aa", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::Before)?)),
        None,
        "insert-leaf-limit",
    )?;
    assert_disabled(&registry, &leaf_state, "x", "breditor/result-limit-exceeded")?;

    let child_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(2),
    );
    let child_state = state(
        &child_context,
        &[paragraph_value(&[("ab", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::Before)?)),
        Some(strong_formats()?),
        "insert-child-limit",
    )?;
    assert_disabled(&registry, &child_state, "X", "breditor/result-limit-exceeded")?;

    let node_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_nodes(4),
    );
    let node_state = state(
        &node_context,
        &[paragraph_value(&[("ab", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        Some(strong_formats()?),
        "insert-node-limit",
    )?;
    assert_disabled(&registry, &node_state, "X", "breditor/result-limit-exceeded")?;

    let exact_total_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(5),
    );
    let exact_total_state = state(
        &exact_total_context,
        &[paragraph_value(&[("aa", false)]), paragraph_value(&[("bb", false)])],
        Some(collapsed(text_point(0, 0, 2, Affinity::After)?)),
        None,
        "insert-total-limit-exact",
    )?;
    let exact_total = enabled(&registry, &exact_total_state, "x")?.execute(&exact_total_state)?;
    assert_paragraph_runs(exact_total.after().document(), 0, &[("aax", false)])?;
    assert_paragraph_runs(exact_total.after().document(), 1, &[("bb", false)])?;
    assert_eq!(exact_total.after().document().summary().total_text_bytes(), 5);

    let total_context = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(4),
    );
    let total_state = state(
        &total_context,
        &[paragraph_value(&[("aa", false)]), paragraph_value(&[("bb", false)])],
        Some(collapsed(text_point(0, 0, 2, Affinity::After)?)),
        None,
        "insert-total-limit",
    )?;
    assert_disabled(&registry, &total_state, "x", "breditor/result-limit-exceeded")?;

    let operation_context = EditorContext::default().with_max_operations_per_transaction(0);
    let operation_state = state(
        &operation_context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "insert-operation-limit",
    )?;
    assert_disabled(&registry, &operation_state, "x", "breditor/operation-budget-exceeded")?;
    Ok(())
}

#[test]
fn insertion_requires_a_range_selection() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let no_selection =
        state(&context, &[paragraph_value(&[("a", false)])], None, None, "insert-no-selection")?;
    assert_disabled(&registry, &no_selection, "x", "breditor/no-selection")?;
    Ok(())
}

#[test]
fn adjacent_typing_merges_until_closed_and_undo_redo_restore_exact_boundaries() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        Some(strong_formats()?),
        "insert-session-history",
    )?;
    let initial_copy = initial.clone();
    let mut session = EditorSession::new(initial);

    for text in ["B", "😀"] {
        let preparation = registry.prepare(session.state(), &invocation(text)?)?;
        session.execute_prepared_action(preparation)?;
    }
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 0);
    assert_paragraph_runs(session.state().document(), 0, &[("a", false), ("B😀", true)])?;
    assert_eq!(session.state().pending_formats(), None);
    let after_merged = session.state().clone();

    session.close_history_group();
    let preparation = registry.prepare(session.state(), &invocation("C")?)?;
    session.execute_prepared_action(preparation)?;
    assert_eq!(session.undo_depth(), 2);
    assert_paragraph_runs(session.state().document(), 0, &[("a", false), ("B😀C", true)])?;
    let after_closed = session.state().clone();

    let Some(first_undo) = session.undo()? else {
        return Err(test_error("closed typing entry was not undoable").into());
    };
    assert_eq!(first_undo.after().document(), after_merged.document());
    assert_eq!(first_undo.after().selection(), after_merged.selection());
    assert_eq!(first_undo.after().pending_formats(), after_merged.pending_formats());
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 1));

    let Some(second_undo) = session.undo()? else {
        return Err(test_error("merged typing entry was not undoable").into());
    };
    assert_eq!(second_undo.after().document(), initial_copy.document());
    assert_eq!(second_undo.after().selection(), initial_copy.selection());
    assert_eq!(second_undo.after().pending_formats(), initial_copy.pending_formats());
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 2));

    let Some(first_redo) = session.redo()? else {
        return Err(test_error("merged typing entry was not redoable").into());
    };
    assert_eq!(first_redo.after().document(), after_merged.document());
    assert_eq!(first_redo.after().selection(), after_merged.selection());
    assert_eq!(first_redo.after().pending_formats(), after_merged.pending_formats());
    let Some(second_redo) = session.redo()? else {
        return Err(test_error("closed typing entry was not redoable").into());
    };
    assert_eq!(second_redo.after().document(), after_closed.document());
    assert_eq!(second_redo.after().selection(), after_closed.selection());
    assert_eq!(second_redo.after().pending_formats(), after_closed.pending_formats());
    assert_eq!((session.undo_depth(), session.redo_depth()), (2, 0));
    Ok(())
}

#[test]
fn exact_equal_replacement_is_a_state_only_commit_and_not_an_undo_entry() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("abc", false)])],
        Some(selected(
            text_point(0, 0, 1, Affinity::Before)?,
            text_point(0, 0, 2, Affinity::After)?,
        )),
        None,
        "insert-exact-equal",
    )?;
    let original_document = initial.document().clone();
    let preparation = enabled(&registry, &initial, "b")?;
    assert_eq!(preparation.transaction().operations().len(), 1);
    assert_eq!(
        preparation.actual_writes(),
        ActionStateDomains::SELECTION | ActionStateDomains::HISTORY | ActionStateDomains::SNAPSHOT
    );
    let mut session = EditorSession::new(initial);
    let commit = session.execute_prepared_action(ActionPreparation::Enabled(preparation))?;
    assert!(commit.forward_operations().is_empty());
    assert!(commit.inverse_operations().is_empty());
    assert_eq!(commit.after().document(), &original_document);
    assert_exact_caret(commit.after(), &text_point(0, 0, 2, Affinity::Before)?)?;
    assert_eq!(commit.revision(), Revision::new(1));
    assert_eq!(session.undo_depth(), 0);
    assert!(session.undo()?.is_none());
    Ok(())
}

#[test]
fn exact_equal_state_only_replacement_preserves_redo_and_closes_typing_merge() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let source_selection =
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(0, 0, 2, Affinity::After)?);

    let redo_initial = state(
        &context,
        &[paragraph_value(&[("abc", false)])],
        Some(source_selection.clone()),
        None,
        "insert-exact-equal-redo",
    )?;
    let mut redo_session = EditorSession::new(redo_initial.clone());
    let changed = registry.prepare(redo_session.state(), &invocation("x")?)?;
    redo_session.execute_prepared_action(changed)?;
    assert_paragraph_runs(redo_session.state().document(), 0, &[("axc", false)])?;
    let changed_result = redo_session.state().clone();
    let Some(_) = redo_session.undo()? else {
        return Err(test_error("setup typing was unexpectedly not undoable").into());
    };
    assert_eq!(redo_session.state().document(), redo_initial.document());
    assert_eq!(redo_session.state().selection(), redo_initial.selection());
    assert_eq!((redo_session.undo_depth(), redo_session.redo_depth()), (0, 1));

    let equal = registry.prepare(redo_session.state(), &invocation("b")?)?;
    let equal_commit = redo_session.execute_prepared_action(equal)?;
    assert!(equal_commit.forward_operations().is_empty());
    assert_eq!(redo_session.state().document(), redo_initial.document());
    assert_exact_caret(redo_session.state(), &text_point(0, 0, 2, Affinity::Before)?)?;
    assert_eq!((redo_session.undo_depth(), redo_session.redo_depth()), (0, 1));
    let Some(redo) = redo_session.redo()? else {
        return Err(test_error("state-only replacement discarded redo").into());
    };
    assert_eq!(redo.after().document(), changed_result.document());
    assert_eq!(redo.after().selection(), changed_result.selection());

    // Redo and an open merge group cannot coexist: undo/replay closes merging,
    // while any new content merge clears redo. Prove merge closure separately
    // by opening the exact typing group around a content commit that deliberately
    // retains an extended selection for the equal replacement.
    let merge_initial = state(
        &context,
        &[paragraph_value(&[("abc", false)])],
        Some(source_selection),
        None,
        "insert-exact-equal-close-merge",
    )?;
    let at_end = TextOffset::try_new(3)?;
    let opening_splice = TextSplice::capture(
        &context,
        merge_initial.document(),
        TextRange::try_new(path(&[0])?, at_end, at_end)?,
        fragment(&[("!", false)])?,
    )?;
    let opening = Transaction::new(&merge_initial, vec![Operation::from(opening_splice)])
        .with_selection_update(SelectionUpdate::Set(merge_initial.selection().cloned()))
        .with_metadata(TransactionMetadata::new(
            Some(insert_text_action_id().qualified_name().clone()),
            HistoryIntent::Merge { group: QualifiedName::try_new(INSERT_TEXT_HISTORY_GROUP_NAME)? },
        ));
    let mut merge_session = EditorSession::new(merge_initial.clone());
    let opening_outcome = merge_session.apply_transaction(&opening)?;
    if opening_outcome.into_commit().is_none() {
        return Err(test_error("typing merge setup was unexpectedly unchanged").into());
    }
    assert_eq!(merge_session.undo_depth(), 1);
    assert_eq!(merge_session.state().selection(), merge_initial.selection());

    let equal = registry.prepare(merge_session.state(), &invocation("b")?)?;
    let equal_commit = merge_session.execute_prepared_action(equal)?;
    assert!(equal_commit.forward_operations().is_empty());
    assert_eq!(merge_session.undo_depth(), 1);
    let next = registry.prepare(merge_session.state(), &invocation("Z")?)?;
    merge_session.execute_prepared_action(next)?;
    assert_paragraph_runs(merge_session.state().document(), 0, &[("abZc!", false)])?;
    assert_eq!(
        merge_session.undo_depth(),
        2,
        "state-only replacement must close the previously open typing merge group"
    );
    let Some(_) = merge_session.undo()? else {
        return Err(test_error("post-boundary typing was unexpectedly not undoable").into());
    };
    assert_paragraph_runs(merge_session.state().document(), 0, &[("abc!", false)])?;
    Ok(())
}

#[test]
fn action_state_catalog_accepts_exact_snippets_but_rejects_a_generic_placeholder() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "insert-fixed-snippet",
    )?;
    let session = EditorSession::new(initial.clone());
    let id = state_id("breditor/snippet-em-dash")?;
    let secret = "fixed-snippet-secret";
    let exact_invocation = invocation(secret)?;
    let source = ActionStateSource::direct(exact_invocation.clone());
    let catalog = ActionStateCatalog::try_new(
        registry.clone(),
        vec![ActionStateRegistration::new(id.clone(), source.clone())],
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
    assert_eq!(session.state(), &initial);
    let debug = format!("{source:?}\n{:?}", catalog.descriptor(&id));
    assert!(!debug.contains(secret));
    assert!(debug.contains("<redacted>"));

    let generic_id = state_id("breditor/generic-insert-text")?;
    assert_eq!(
        ActionStateCatalog::try_new(
            registry,
            vec![ActionStateRegistration::new(
                generic_id.clone(),
                ActionStateSource::direct(ActionInvocation::without_input(insert_text_action_id())),
            )],
        )
        .err(),
        Some(ActionStateCatalogError::InvalidActionInput {
            id: generic_id,
            action: insert_text_action_id(),
            source: ActionInputError::ExpectedTyped { expected: insert_text_input_contract() },
        })
    );

    let prepared =
        registry_for_exact_source(&catalog).prepare(session.state(), &exact_invocation)?;
    assert!(matches!(prepared, ActionPreparation::Enabled(_)));
    Ok(())
}

fn registry_for_exact_source(catalog: &ActionStateCatalog) -> &ActionRegistry {
    catalog.action_registry()
}
