//! Black-box contracts for atomic multiline plain-text insertion.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionActivation, ActionInput, ActionInputContract, ActionInputError, ActionInputVersion,
        ActionInvocation, ActionPreparation, ActionPrepareError, ActionRegistration,
        ActionRegistry, ActionStateBatch, ActionStateCatalog, ActionStateCatalogError,
        ActionStateDomains, ActionStateId, ActionStateOutcome, ActionStateRegistration,
        ActionStateSource, ActionValue, ActionValueError, DecodeActionInput,
        MAX_ACTION_VALUE_TEXT_BYTES, PreparedAction, ResolvedActionState,
        builtins::{
            INSERT_PLAIN_TEXT_ACTION_NAME, INSERT_PLAIN_TEXT_EMPTY_INPUT_CODE,
            INSERT_PLAIN_TEXT_INPUT_CONTRACT_NAME, INSERT_PLAIN_TEXT_INPUT_NOT_STRING_CODE,
            INSERT_PLAIN_TEXT_INPUT_VERSION, INSERT_PLAIN_TEXT_PARAGRAPH_LIMIT_CODE,
            InsertPlainTextAction, InsertPlainTextInput, InsertPlainTextInputError,
            MAX_INSERT_PLAIN_TEXT_BYTES, MAX_INSERT_PLAIN_TEXT_PARAGRAPHS,
            MAX_INSERT_PLAIN_TEXT_UTF16_CODE_UNITS, base_action_registry,
            insert_plain_text_action_id, insert_plain_text_input_contract,
        },
    },
    codec::DocumentJsonCodec,
    document::{Document, Format, FormatSet, PropertyInteger, PropertyMap},
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

fn collapsed(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_plain_text_action_id(),
        ActionInput::typed(insert_plain_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn enabled(
    registry: &ActionRegistry,
    state: &EditorState,
    text: &str,
) -> Result<PreparedAction, Box<dyn Error>> {
    match registry.prepare(state, &invocation(text)?)? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(disabled) => Err(test_error(format!(
            "insert-plain-text unexpectedly disabled: {}",
            disabled.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    text: &str,
    expected: &str,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(disabled) = registry.prepare(state, &invocation(text)?)? else {
        return Err(test_error(format!("expected disabled reason {expected}")).into());
    };
    assert_eq!(disabled.reason().code().as_str(), expected);
    assert_eq!(disabled.reason().detail(), None);
    assert_eq!(disabled.base_state(), state);
    assert_eq!(state, &original);
    Ok(())
}

fn only_root_replace(operations: &[Operation]) -> Result<&RootTextReplace, Box<dyn Error>> {
    let [Operation::RootTextReplace(operation)] = operations else {
        return Err(test_error(format!(
            "expected exactly one root text replacement, got {operations:?}"
        ))
        .into());
    };
    Ok(operation)
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
    for (child, (text, strong)) in paragraph.children().iter().zip(expected) {
        let run = child.as_text().ok_or_else(|| test_error("paragraph child was not text"))?;
        assert_eq!(run.text(), *text);
        assert_eq!(!run.formats().is_empty(), *strong);
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
fn input_contract_normalizes_only_html_plain_text_line_endings_and_redacts_payloads() -> TestResult
{
    let registry = base_action_registry()?;
    let action = insert_plain_text_action_id();
    let contract = insert_plain_text_input_contract();
    assert_eq!(action.as_str(), INSERT_PLAIN_TEXT_ACTION_NAME);
    assert_eq!(contract.name().as_str(), INSERT_PLAIN_TEXT_INPUT_CONTRACT_NAME);
    assert_eq!(contract.version(), INSERT_PLAIN_TEXT_INPUT_VERSION);
    assert_eq!(contract.version().get(), 1);
    assert_eq!(
        registry.descriptor(&action).and_then(|descriptor| descriptor.input_contract()),
        Some(&contract)
    );

    let private = "a\r\nb\rc\nd\u{85}e\u{2028}f\u{2029}g";
    let input = InsertPlainTextInput::try_new(private)?;
    assert_eq!(input.text(), "a\nb\nc\nd\u{85}e\u{2028}f\u{2029}g");
    assert_eq!(input.paragraph_count(), 4);
    assert_eq!(input.utf16_len(), 13);
    assert!(!format!("{input:?}").contains(private));
    assert!(format!("{input:?}").contains("<redacted>"));

    assert_eq!(InsertPlainTextInput::try_new(""), Err(InsertPlainTextInputError::Empty));
    let maximum = usize::try_from(MAX_INSERT_PLAIN_TEXT_BYTES)?;
    assert_eq!(MAX_INSERT_PLAIN_TEXT_BYTES, MAX_ACTION_VALUE_TEXT_BYTES);
    assert_eq!(MAX_INSERT_PLAIN_TEXT_BYTES, 65_536);
    assert_eq!(u64::from(MAX_INSERT_PLAIN_TEXT_UTF16_CODE_UNITS), MAX_INSERT_PLAIN_TEXT_BYTES);
    assert_eq!(MAX_INSERT_PLAIN_TEXT_PARAGRAPHS, 10_000);
    let boundary_text = "x".repeat(maximum);
    let boundary = InsertPlainTextInput::try_new(&boundary_text)?;
    assert_eq!(boundary.text_bytes(), maximum);
    assert_eq!(boundary.utf16_len(), MAX_INSERT_PLAIN_TEXT_UTF16_CODE_UNITS);
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "plain-input-boundary",
    )?;
    assert!(matches!(
        registry.prepare(&initial, &invocation(&boundary_text)?)?,
        ActionPreparation::Enabled(_)
    ));

    let over = maximum.saturating_add(1);
    assert_eq!(
        InsertPlainTextInput::try_new("x".repeat(over)),
        Err(InsertPlainTextInputError::TextBytes {
            actual: u64::try_from(over)?,
            maximum: MAX_INSERT_PLAIN_TEXT_BYTES,
        })
    );
    assert_eq!(
        ActionValue::try_from_string("x".repeat(over)),
        Err(ActionValueError::TextBytes {
            actual: MAX_ACTION_VALUE_TEXT_BYTES + 1,
            maximum: MAX_ACTION_VALUE_TEXT_BYTES,
        })
    );
    assert_eq!(
        InsertPlainTextInput::try_new("\n".repeat(10_000)),
        Err(InsertPlainTextInputError::Paragraphs { actual: 10_001, maximum: 10_000 })
    );

    let secret = "secret-plain-text-payload";
    let decoded = InsertPlainTextInput::try_new(secret)?;
    let wire = ActionInput::typed(contract, ActionValue::try_from_string(secret)?);
    let request = ActionInvocation::new(insert_plain_text_action_id(), wire.clone());
    assert_eq!(
        InsertPlainTextInput::decode(None, &wire),
        Err(ActionInputError::MissingRegisteredContract)
    );
    let debug = format!("{decoded:?}\n{wire:?}\n{request:?}");
    assert!(!debug.contains(secret));
    assert!(debug.contains("<redacted>"));
    assert!(debug.contains(INSERT_PLAIN_TEXT_INPUT_CONTRACT_NAME));
    Ok(())
}

#[test]
fn malformed_typed_inputs_return_stable_codes_before_action_planning() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "plain-input-errors",
    )?;
    let action = insert_plain_text_action_id();
    let contract = insert_plain_text_input_contract();

    assert_eq!(
        registry.prepare(&initial, &ActionInvocation::without_input(action.clone())).err(),
        Some(ActionPrepareError::InvalidInput {
            id: action.clone(),
            source: ActionInputError::ExpectedTyped { expected: contract.clone() },
        })
    );

    let version_two = ActionInputContract::new(
        QualifiedName::try_new(INSERT_PLAIN_TEXT_INPUT_CONTRACT_NAME)?,
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

    for value in [
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
                        ActionInput::typed(contract.clone(), value),
                    ),
                )
                .err(),
            Some(ActionPrepareError::InvalidInput {
                id: action.clone(),
                source: ActionInputError::InvalidValue {
                    code: QualifiedName::try_new(INSERT_PLAIN_TEXT_INPUT_NOT_STRING_CODE)?,
                },
            })
        );
    }

    for (value, code) in [
        (ActionValue::try_from_string("")?, INSERT_PLAIN_TEXT_EMPTY_INPUT_CODE),
        (
            ActionValue::try_from_string("\n".repeat(10_000))?,
            INSERT_PLAIN_TEXT_PARAGRAPH_LIMIT_CODE,
        ),
    ] {
        assert_eq!(
            registry
                .prepare(
                    &initial,
                    &ActionInvocation::new(
                        action.clone(),
                        ActionInput::typed(contract.clone(), value),
                    ),
                )
                .err(),
            Some(ActionPrepareError::InvalidInput {
                id: action.clone(),
                source: ActionInputError::InvalidValue { code: QualifiedName::try_new(code)? },
            })
        );
    }
    Ok(())
}

#[test]
fn direct_decoder_and_misregistered_handler_reject_input_v2() -> TestResult {
    let expected = insert_plain_text_input_contract();
    let actual = ActionInputContract::new(
        QualifiedName::try_new(INSERT_PLAIN_TEXT_INPUT_CONTRACT_NAME)?,
        ActionInputVersion::try_new(2)?,
    );
    let input = ActionInput::typed(actual.clone(), ActionValue::try_from_string("x")?);
    assert_eq!(
        InsertPlainTextInput::decode(Some(&expected), &input),
        Err(ActionInputError::ContractMismatch {
            expected: expected.clone(),
            actual: actual.clone()
        })
    );

    let action = insert_plain_text_action_id();
    let registry = ActionRegistry::try_new(vec![ActionRegistration::with_input(
        action.clone(),
        actual.clone(),
        InsertPlainTextAction,
    )])?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "plain-misregistered-input-v2",
    )?;
    assert_eq!(
        registry.prepare(&initial, &ActionInvocation::new(action.clone(), input)).err(),
        Some(ActionPrepareError::InvalidInput {
            id: action,
            source: ActionInputError::ContractMismatch { expected, actual },
        })
    );
    Ok(())
}

#[test]
fn mixed_line_endings_publish_one_atomic_structural_replacement() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("LR", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        Some(strong_formats()?),
        "plain-mixed-lines",
    )?;
    let prepared = enabled(&registry, &initial, "a\r\nb\rc\nd")?;
    let operation = only_root_replace(prepared.transaction().operations())?;
    assert_eq!(operation.replacement_paragraphs().len(), 4);
    assert_eq!(prepared.transaction().metadata().history(), &HistoryIntent::Record);
    let commit = prepared.execute(&initial)?;

    assert_paragraph_count(commit.after().document(), 4)?;
    assert_paragraph_runs(commit.after().document(), 0, &[("L", false), ("a", true)])?;
    assert_paragraph_runs(commit.after().document(), 1, &[("b", true)])?;
    assert_paragraph_runs(commit.after().document(), 2, &[("c", true)])?;
    assert_paragraph_runs(commit.after().document(), 3, &[("d", true), ("R", false)])?;
    assert_exact_caret(commit.after(), &text_point(3, 1, 0, Affinity::Before)?)?;
    assert_eq!(commit.after().pending_formats(), None);
    assert!(matches!(commit.forward_operations(), [Operation::RootTextReplace(_)]));
    assert!(matches!(commit.inverse_operations(), [Operation::RootTextReplace(_)]));
    Ok(())
}

#[test]
fn leading_trailing_and_consecutive_boundaries_preserve_empty_paragraphs_and_caret() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("LR", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::Before)?)),
        None,
        "plain-empty-lines",
    )?;
    let commit = enabled(&registry, &initial, "\n\n")?.execute(&initial)?;

    assert_paragraph_count(commit.after().document(), 3)?;
    assert_paragraph_runs(commit.after().document(), 0, &[("L", false)])?;
    assert_paragraph_runs(commit.after().document(), 1, &[])?;
    assert_paragraph_runs(commit.after().document(), 2, &[("R", false)])?;
    assert_exact_caret(commit.after(), &text_point(2, 0, 0, Affinity::Before)?)?;
    Ok(())
}

#[test]
fn directional_cross_paragraph_replacement_is_spatial_and_inherits_first_selected_format()
-> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let early = text_point(0, 0, 1, Affinity::Before)?;
    let late = text_point(2, 0, 1, Affinity::After)?;
    let mut results = Vec::new();
    for (lineage, anchor, focus) in [
        ("plain-cross-forward", early.clone(), late.clone()),
        ("plain-cross-backward", late, early),
    ] {
        let initial = state(
            &context,
            &[
                paragraph_value(&[("ab", true)]),
                paragraph_value(&[("middle", false)]),
                paragraph_value(&[("ef", false)]),
            ],
            Some(selected(anchor, focus)),
            None,
            lineage,
        )?;
        let prepared = enabled(&registry, &initial, "X\nY")?;
        assert_eq!(
            only_root_replace(prepared.transaction().operations())?.expected_paragraphs().len(),
            3
        );
        let commit = prepared.execute(&initial)?;
        assert_paragraph_count(commit.after().document(), 2)?;
        assert_paragraph_runs(commit.after().document(), 0, &[("aX", true)])?;
        assert_paragraph_runs(commit.after().document(), 1, &[("Y", true), ("f", false)])?;
        assert_exact_caret(commit.after(), &text_point(1, 1, 0, Affinity::Before)?)?;
        assert_eq!(commit.after().pending_formats(), None);
        results.push((commit.after().document().clone(), commit.after().selection().cloned()));
    }
    assert_eq!(results[0], results[1]);
    Ok(())
}

#[test]
fn unicode_line_separators_remain_literal_inline_text() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[])],
        Some(collapsed(Point::Children {
            parent_path: path(&[0])?,
            child_index: 0,
            affinity: Affinity::After,
        })),
        None,
        "plain-unicode-separators",
    )?;
    let literal = "a\u{85}b\u{2028}c\u{2029}d";
    let commit = enabled(&registry, &initial, literal)?.execute(&initial)?;
    assert_paragraph_count(commit.after().document(), 1)?;
    assert_paragraph_runs(commit.after().document(), 0, &[(literal, false)])?;
    Ok(())
}

#[test]
fn operation_root_leaf_and_total_text_limits_disable_without_partial_state() -> TestResult {
    let registry = base_action_registry()?;

    let no_operations = EditorContext::default().with_max_operations_per_transaction(0);
    let operation_state = state(
        &no_operations,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "plain-operation-limit",
    )?;
    assert_disabled(&registry, &operation_state, "x", "breditor/operation-budget-exceeded")?;

    let one_root_child = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_children_per_element(1),
    );
    let root_state = state(
        &one_root_child,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "plain-root-limit",
    )?;
    assert_disabled(&registry, &root_state, "\n", "breditor/result-limit-exceeded")?;

    let short_leaf = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_text_bytes(2),
    );
    let leaf_state = state(
        &short_leaf,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "plain-leaf-limit",
    )?;
    assert_disabled(&registry, &leaf_state, "bb", "breditor/result-limit-exceeded")?;

    let total_text = EditorContext::new(
        CompiledSchema::breditor_base(),
        DocumentLimits::default().with_max_total_text_bytes(2),
    );
    let total_state = state(
        &total_text,
        &[paragraph_value(&[("a", false)]), paragraph_value(&[("b", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "plain-total-limit",
    )?;
    assert_disabled(&registry, &total_state, "x", "breditor/result-limit-exceeded")?;
    Ok(())
}

#[test]
fn one_multiline_action_is_one_exact_session_undo_and_redo_step() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("ab", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        Some(strong_formats()?),
        "plain-history",
    )?;
    let mut session = EditorSession::new(initial.clone());
    let prepared = registry.prepare(session.state(), &invocation("X\nY")?)?;
    let commit = session.execute_prepared_action(prepared)?;
    let inserted = commit.after().clone();
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    let undo =
        session.undo()?.ok_or_else(|| test_error("plain-text insertion was not undoable"))?;
    assert_eq!(undo.after().document(), initial.document());
    assert_eq!(undo.after().selection(), initial.selection());
    assert_eq!(undo.after().pending_formats(), initial.pending_formats());
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let redo =
        session.redo()?.ok_or_else(|| test_error("plain-text insertion was not redoable"))?;
    assert_eq!(redo.after().document(), inserted.document());
    assert_eq!(redo.after().selection(), inserted.selection());
    assert_eq!(redo.after().pending_formats(), inserted.pending_formats());
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn exact_formatted_replacement_is_selection_only_and_preserves_redo() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let early = text_point(0, 1, 0, Affinity::Before)?;
    let late = text_point(0, 1, 1, Affinity::After)?;
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false), ("B", true), ("c", false)])],
        Some(selected(late, early)),
        None,
        "plain-exact-formatted-replacement",
    )?;
    let initial_value = initial.clone();
    let mut session = EditorSession::new(initial);

    let changed = registry.prepare(session.state(), &invocation("X")?)?;
    session.execute_prepared_action(changed)?;
    assert_paragraph_runs(
        session.state().document(),
        0,
        &[("a", false), ("X", true), ("c", false)],
    )?;
    let changed_value = session.state().clone();
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    let undo = session.undo()?.ok_or_else(|| test_error("setup paste was not undoable"))?;
    assert_eq!(undo.after().document(), initial_value.document());
    assert_eq!(undo.after().selection(), initial_value.selection());
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let exact = enabled(&registry, session.state(), "B")?;
    let expected_caret = text_point(0, 2, 0, Affinity::Before)?;
    let transaction = exact.transaction();
    let operation = only_root_replace(transaction.operations())?;
    assert_eq!(operation.range().start().paragraph_index(), 0);
    assert_eq!(operation.range().start().offset(), TextOffset::try_new(1)?);
    assert_eq!(operation.range().end().paragraph_index(), 0);
    assert_eq!(operation.range().end().offset(), TextOffset::try_new(2)?);
    assert_eq!(operation.expected_paragraphs().len(), 1);
    assert_eq!(operation.replacement_paragraphs().len(), 1);
    let replacement = &operation.replacement_paragraphs()[0];
    let mut replacement_runs = replacement.iter();
    let replacement_run = replacement_runs
        .next()
        .ok_or_else(|| test_error("expected one formatted replacement run"))?;
    assert!(replacement_runs.next().is_none());
    assert_eq!(replacement_run.text(), "B");
    assert_eq!(replacement_run.formats(), &strong_formats()?);
    assert_eq!(
        transaction.selection_update(),
        &SelectionUpdate::Set(Some(collapsed(expected_caret.clone())))
    );
    assert_eq!(transaction.pending_formats_update(), &PendingFormatsUpdate::Set(None));
    let action = insert_plain_text_action_id();
    assert_eq!(transaction.metadata().action(), Some(action.qualified_name()));
    assert_eq!(transaction.metadata().history(), &HistoryIntent::Record);

    let exact_commit = session.execute_prepared_action(ActionPreparation::Enabled(exact))?;
    assert!(exact_commit.forward_operations().is_empty());
    assert!(exact_commit.inverse_operations().is_empty());
    assert_eq!(exact_commit.metadata().history(), &HistoryIntent::Record);
    assert_eq!(exact_commit.after().document(), initial_value.document());
    assert_exact_caret(exact_commit.after(), &expected_caret)?;
    assert_eq!(exact_commit.after().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let after_exact = session.state().clone();
    assert!(session.undo()?.is_none());
    assert_eq!(session.state(), &after_exact);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let redo = session.redo()?.ok_or_else(|| test_error("state-only paste discarded redo"))?;
    assert_eq!(redo.after().document(), changed_value.document());
    assert_eq!(redo.after().selection(), changed_value.selection());
    assert_eq!(redo.after().pending_formats(), changed_value.pending_formats());
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    Ok(())
}

#[test]
fn action_state_catalog_accepts_an_exact_paste_but_rejects_a_generic_placeholder() -> TestResult {
    let registry = base_action_registry()?;
    let context = EditorContext::default();
    let initial = state(
        &context,
        &[paragraph_value(&[("a", false)])],
        Some(collapsed(text_point(0, 0, 1, Affinity::After)?)),
        None,
        "plain-fixed-paste",
    )?;
    let session = EditorSession::new(initial.clone());
    let id = state_id("breditor/plain-text-paste")?;
    let secret = "fixed-paste-secret\nsecond-line";
    let exact_invocation = invocation(secret)?;
    let source = ActionStateSource::direct(exact_invocation.clone());
    let catalog = ActionStateCatalog::try_new(
        registry.clone(),
        vec![ActionStateRegistration::new(id.clone(), source.clone())],
    )?;
    let descriptor = catalog
        .descriptor(&id)
        .ok_or_else(|| test_error("missing plain-text action-state descriptor"))?;
    assert_eq!(descriptor.id(), &id);
    assert_eq!(descriptor.source(), &source);
    assert_eq!(
        descriptor.effects(),
        registry
            .descriptor(&insert_plain_text_action_id())
            .ok_or_else(|| test_error("missing insert-plain-text registry descriptor"))?
            .state_spec()
            .effects()
    );

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
    let debug = format!("{source:?}\n{descriptor:?}");
    assert!(!debug.contains(secret));
    assert!(debug.contains("<redacted>"));

    let generic_id = state_id("breditor/generic-plain-text-paste")?;
    assert_eq!(
        ActionStateCatalog::try_new(
            registry,
            vec![ActionStateRegistration::new(
                generic_id.clone(),
                ActionStateSource::direct(ActionInvocation::without_input(
                    insert_plain_text_action_id(),
                )),
            )],
        )
        .err(),
        Some(ActionStateCatalogError::InvalidActionInput {
            id: generic_id,
            action: insert_plain_text_action_id(),
            source: ActionInputError::ExpectedTyped {
                expected: insert_plain_text_input_contract(),
            },
        })
    );

    let prepared = catalog.action_registry().prepare(session.state(), &exact_invocation)?;
    assert!(matches!(prepared, ActionPreparation::Enabled(_)));
    Ok(())
}
