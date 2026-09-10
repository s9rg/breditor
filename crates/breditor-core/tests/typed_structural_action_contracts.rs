//! Typed-property contracts for structural built-in actions.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionInput, ActionInvocation, ActionPreparation, ActionRegistry, ActionValue,
        PreparedAction,
        builtins::{
            base_action_registry, insert_paragraph_break_action_id, insert_plain_text_action_id,
            insert_plain_text_input_contract,
        },
    },
    codec::DocumentJsonCodecV2,
    document::{Document, Format, FormatSet, PropertyMap, PropertyValue},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::Operation,
    position::{Affinity, Point},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
};
use serde_json::{Value, json};
use support::{TestResult, path, test_error};

const LINK: &str = "example/link";
const HREF: &str = "example/href";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn typed_schema() -> Result<CompiledSchema, Box<dyn Error>> {
    let contract = InlineFormatPropertyContractV1::try_new(
        name(LINK)?,
        vec![InlineFormatPropertySpecV1::new(
            name(HREF)?,
            PropertyPresenceV1::Required,
            InlineFormatPropertyTypeV1::try_string(1, 64)?,
        )],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/typed-actions")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/typed-action-profile")?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn format_value(kind: &str, properties: &Value) -> Value {
    json!({ "type": kind, "properties": properties })
}

fn run_value(text: &str, href: Option<&str>) -> Value {
    let formats =
        href.map_or_else(Vec::new, |href| vec![format_value(LINK, &json!({ (HREF): href }))]);
    json!({ "kind": "text", "text": text, "formats": formats })
}

fn paragraph_value(runs: &[(&str, Option<&str>)]) -> Value {
    json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": runs
            .iter()
            .map(|(text, href)| run_value(text, *href))
            .collect::<Vec<_>>(),
    })
}

fn document_json(schema: &CompiledSchema, paragraphs: &[Value]) -> String {
    json!({
        "format": "breditor/document",
        "formatVersion": 2,
        "schema": {
            "name": schema.id().name().as_str(),
            "version": schema.id().version().get(),
        },
        "schemaFingerprint": schema.fingerprint().to_string(),
        "root": {
            "kind": "element",
            "type": "breditor/document",
            "entityId": null,
            "properties": {},
            "children": paragraphs,
        },
    })
    .to_string()
}

fn formats(href: &str) -> Result<FormatSet, Box<dyn Error>> {
    let properties =
        PropertyMap::try_from_sorted(vec![(name(HREF)?, PropertyValue::from_string(href))])?;
    FormatSet::try_from_formats(vec![Format::new(name(LINK)?, properties)]).map_err(Into::into)
}

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    selection: Selection,
    pending_formats: Option<FormatSet>,
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodecV2::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(context.schema(), paragraphs))?;
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
    paragraph: u32,
    run: u32,
    offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[paragraph, run])?, utf16_offset: offset, affinity })
}

fn child_point(paragraph: u32, child: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Children { parent_path: path(&[paragraph])?, child_index: child, affinity })
}

fn collapsed(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn plain_text_invocation(text: &str) -> Result<ActionInvocation, Box<dyn Error>> {
    Ok(ActionInvocation::new(
        insert_plain_text_action_id(),
        ActionInput::typed(insert_plain_text_input_contract(), ActionValue::try_from_string(text)?),
    ))
}

fn enabled(
    registry: &ActionRegistry,
    state: &EditorState,
    invocation: &ActionInvocation,
) -> Result<PreparedAction, Box<dyn Error>> {
    match registry.prepare(state, invocation)? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(disabled) => Err(test_error(format!(
            "{} unexpectedly disabled: {}",
            invocation.id().as_str(),
            disabled.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    invocation: &ActionInvocation,
    expected_code: &str,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(disabled) = registry.prepare(state, invocation)? else {
        return Err(test_error(format!("expected disabled reason {expected_code}")).into());
    };
    assert_eq!(disabled.reason().code().as_str(), expected_code);
    assert_eq!(disabled.reason().detail(), None);
    assert_eq!(disabled.base_state(), state);
    assert_eq!(state, &original);
    Ok(())
}

fn assert_paragraph_runs(
    document: &Document,
    paragraph_index: usize,
    expected: &[(&str, Option<&str>)],
) -> TestResult {
    let paragraph = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(paragraph_index))
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| test_error(format!("paragraph {paragraph_index} is missing")))?;
    assert_eq!(paragraph.children().len(), expected.len());
    for (child, (expected_text, expected_href)) in paragraph.children().iter().zip(expected) {
        let run = child.as_text().ok_or_else(|| test_error("paragraph child was not text"))?;
        assert_eq!(run.text(), *expected_text);
        match expected_href {
            Some(href) => assert_eq!(run.formats(), &formats(href)?),
            None => assert!(run.formats().is_empty()),
        }
    }
    Ok(())
}

fn assert_selection(state: &EditorState, expected: &Point) -> TestResult {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(test_error("result selection is missing").into());
    };
    assert_eq!(range.anchor(), expected);
    assert_eq!(range.focus(), expected);
    Ok(())
}

fn assert_same_editor_value(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.context(), expected.context());
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

#[test]
fn typed_paragraph_break_is_exact_at_property_limits_and_replays() -> TestResult {
    let registry = base_action_registry()?;
    let invocation = ActionInvocation::without_input(insert_paragraph_break_action_id());
    let schema = typed_schema()?;
    let context = EditorContext::new(
        schema.clone(),
        DocumentLimits::default()
            .with_max_property_values(2)
            .with_max_total_property_string_bytes(6),
    );
    let pending = formats("p")?;
    let initial = state(
        &context,
        &[paragraph_value(&[("ab", Some("old"))])],
        collapsed(text_point(0, 0, 1, Affinity::After)?),
        Some(pending.clone()),
        "typed-enter-exact-budget",
    )?;
    let initial_value = initial.clone();
    let mut session = EditorSession::new(initial);
    let prepared = enabled(&registry, session.state(), &invocation)?;
    assert!(matches!(prepared.transaction().operations(), [Operation::ParagraphSplit(_)]));
    let commit = session.execute_prepared_action(ActionPreparation::Enabled(prepared))?;
    assert!(matches!(commit.inverse_operations(), [Operation::ParagraphJoin(_)]));
    assert_paragraph_runs(session.state().document(), 0, &[("a", Some("old"))])?;
    assert_paragraph_runs(session.state().document(), 1, &[("b", Some("old"))])?;
    assert_selection(session.state(), &child_point(1, 0, Affinity::After)?)?;
    assert_eq!(session.state().pending_formats(), Some(&pending));
    assert_eq!(session.state().document().summary().property_value_count(), 2);
    assert_eq!(session.state().document().summary().total_property_string_bytes(), 6);
    let final_value = session.state().clone();

    let Some(undo) = session.undo()? else {
        return Err(test_error("typed paragraph split was not undoable").into());
    };
    assert_eq!(undo.forward_operations(), commit.inverse_operations());
    assert_same_editor_value(session.state(), &initial_value);
    let Some(redo) = session.redo()? else {
        return Err(test_error("typed paragraph split was not redoable").into());
    };
    assert_eq!(redo.forward_operations(), commit.forward_operations());
    assert_same_editor_value(session.state(), &final_value);

    for (lineage, limits) in [
        (
            "typed-enter-property-value-excess",
            DocumentLimits::default().with_max_property_values(1),
        ),
        (
            "typed-enter-property-string-excess",
            DocumentLimits::default().with_max_total_property_string_bytes(5),
        ),
    ] {
        let limited_context = EditorContext::new(schema.clone(), limits);
        let limited = state(
            &limited_context,
            &[paragraph_value(&[("ab", Some("old"))])],
            collapsed(text_point(0, 0, 1, Affinity::After)?),
            None,
            lineage,
        )?;
        assert_disabled(&registry, &limited, &invocation, "breditor/result-limit-exceeded")?;
    }
    Ok(())
}

#[test]
fn typed_selected_paragraph_break_uses_one_atomic_root_replace() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default())
        .with_max_operations_per_transaction(1);
    let selection =
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(0, 0, 2, Affinity::After)?);
    let initial = state(
        &context,
        &[paragraph_value(&[("abc", Some("old"))])],
        selection,
        None,
        "typed-selected-enter-atomic",
    )?;
    let invocation = ActionInvocation::without_input(insert_paragraph_break_action_id());
    let prepared = enabled(&base_action_registry()?, &initial, &invocation)?;
    assert!(matches!(prepared.transaction().operations(), [Operation::RootTextReplace(_)]));
    let commit = prepared.execute(&initial)?;
    assert!(matches!(commit.inverse_operations(), [Operation::RootTextReplace(_)]));
    assert_paragraph_runs(commit.after().document(), 0, &[("a", Some("old"))])?;
    assert_paragraph_runs(commit.after().document(), 1, &[("c", Some("old"))])?;
    assert_selection(commit.after(), &child_point(1, 0, Affinity::After)?)?;
    Ok(())
}

#[test]
fn typed_multiline_plain_text_repeats_pending_formats_with_exact_budget_and_replays() -> TestResult
{
    let registry = base_action_registry()?;
    let invocation = plain_text_invocation("a\nb")?;
    let schema = typed_schema()?;
    let context = EditorContext::new(
        schema.clone(),
        DocumentLimits::default()
            .with_max_property_values(2)
            .with_max_total_property_string_bytes(6),
    );
    let pending = formats("new")?;
    let initial = state(
        &context,
        &[paragraph_value(&[("z", None)])],
        collapsed(text_point(0, 0, 0, Affinity::Before)?),
        Some(pending.clone()),
        "typed-plain-text-exact-budget",
    )?;
    let initial_value = initial.clone();
    let mut session = EditorSession::new(initial);
    let prepared = enabled(&registry, session.state(), &invocation)?;
    assert!(matches!(prepared.transaction().operations(), [Operation::RootTextReplace(_)]));
    let commit = session.execute_prepared_action(ActionPreparation::Enabled(prepared))?;
    assert!(matches!(commit.inverse_operations(), [Operation::RootTextReplace(_)]));
    assert_paragraph_runs(session.state().document(), 0, &[("a", Some("new"))])?;
    assert_paragraph_runs(session.state().document(), 1, &[("b", Some("new")), ("z", None)])?;
    assert_selection(session.state(), &text_point(1, 1, 0, Affinity::Before)?)?;
    assert_eq!(session.state().pending_formats(), None);
    assert_eq!(session.state().document().summary().property_value_count(), 2);
    assert_eq!(session.state().document().summary().total_property_string_bytes(), 6);
    let final_value = session.state().clone();

    let Some(undo) = session.undo()? else {
        return Err(test_error("typed multiline insertion was not undoable").into());
    };
    assert_eq!(undo.forward_operations(), commit.inverse_operations());
    assert_same_editor_value(session.state(), &initial_value);
    let Some(redo) = session.redo()? else {
        return Err(test_error("typed multiline insertion was not redoable").into());
    };
    assert_eq!(redo.forward_operations(), commit.forward_operations());
    assert_same_editor_value(session.state(), &final_value);

    for (lineage, limits) in [
        (
            "typed-plain-text-property-value-excess",
            DocumentLimits::default().with_max_property_values(1),
        ),
        (
            "typed-plain-text-property-string-excess",
            DocumentLimits::default().with_max_total_property_string_bytes(5),
        ),
    ] {
        let limited_context = EditorContext::new(schema.clone(), limits);
        let limited = state(
            &limited_context,
            &[paragraph_value(&[("z", None)])],
            collapsed(text_point(0, 0, 0, Affinity::Before)?),
            Some(pending.clone()),
            lineage,
        )?;
        assert_disabled(&registry, &limited, &invocation, "breditor/result-limit-exceeded")?;
    }
    Ok(())
}

#[test]
fn typed_cross_paragraph_plain_text_keeps_retained_and_inherited_properties() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let initial_selection =
        selected(text_point(1, 0, 1, Affinity::After)?, text_point(0, 0, 1, Affinity::Before)?);
    let initial = state(
        &context,
        &[paragraph_value(&[("ab", Some("left"))]), paragraph_value(&[("cd", Some("right"))])],
        initial_selection,
        None,
        "typed-cross-plain-text",
    )?;
    let invocation = plain_text_invocation("X\nY")?;
    let prepared = enabled(&base_action_registry()?, &initial, &invocation)?;
    assert!(matches!(prepared.transaction().operations(), [Operation::RootTextReplace(_)]));
    let commit = prepared.execute(&initial)?;
    assert!(matches!(commit.inverse_operations(), [Operation::RootTextReplace(_)]));
    assert_paragraph_runs(commit.after().document(), 0, &[("aX", Some("left"))])?;
    assert_paragraph_runs(
        commit.after().document(),
        1,
        &[("Y", Some("left")), ("d", Some("right"))],
    )?;
    assert_selection(commit.after(), &text_point(1, 1, 0, Affinity::Before)?)?;
    assert_eq!(commit.after().pending_formats(), None);
    Ok(())
}
