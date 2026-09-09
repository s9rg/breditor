//! Property-aware contracts for collapsed semantic text insertion.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionInput, ActionInvocation, ActionPreparation, ActionRegistry, ActionValue,
        builtins::{base_action_registry, insert_text_action_id, insert_text_input_contract},
    },
    codec::DocumentJsonCodecV2,
    document::{Document, Format, FormatSet, PropertyMap, PropertyValue},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, TextSplice},
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
            InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
        )],
    )?;
    let manifest = ExtensionManifest::try_new_with_inline_formats_and_property_contracts(
        ExtensionId::new(name("example/link-extension")?, ExtensionVersion::try_new(1)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one())],
        vec![contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/link-profile")?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn format_value(kind: &str, properties: &Value) -> Value {
    json!({ "type": kind, "properties": properties })
}

fn run_value(text: &str, formats: &[Value]) -> Value {
    json!({ "kind": "text", "text": text, "formats": formats })
}

fn plain(text: &str) -> Value {
    run_value(text, &[])
}

fn linked(text: &str, href: &str) -> Value {
    run_value(text, &[format_value(LINK, &json!({ (HREF): href }))])
}

fn paragraph_value(runs: &[Value]) -> Value {
    json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": runs,
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

fn state(
    context: &EditorContext,
    paragraphs: &[Value],
    selection: Option<Selection>,
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
        selection,
        pending_formats,
    )
    .map_err(Into::into)
}

fn link_formats(href: &str) -> Result<FormatSet, Box<dyn Error>> {
    let properties =
        PropertyMap::try_from_sorted(vec![(name(HREF)?, PropertyValue::from_string(href))])?;
    FormatSet::try_from_formats(vec![Format::new(name(LINK)?, properties)]).map_err(Into::into)
}

fn text_point(
    paragraph: u32,
    run: u32,
    offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text { text_path: path(&[paragraph, run])?, utf16_offset: offset, affinity })
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
        return Err(test_error(format!("expected one TextSplice, got {operations:?}")).into());
    };
    Ok(splice)
}

fn assert_runs(document: &Document, expected: &[(&str, Option<&str>)]) -> TestResult {
    let paragraph = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| test_error("first paragraph is missing"))?;
    assert_eq!(paragraph.children().len(), expected.len());
    let link = name(LINK)?;
    let href = name(HREF)?;
    for (child, (expected_text, expected_href)) in paragraph.children().iter().zip(expected) {
        let run = child.as_text().ok_or_else(|| test_error("paragraph child was not text"))?;
        assert_eq!(run.text(), *expected_text);
        match expected_href {
            Some(expected_href) => {
                assert_eq!(run.formats().len(), 1);
                let format = run
                    .formats()
                    .get(&link)
                    .ok_or_else(|| test_error("linked run is missing its link format"))?;
                assert_eq!(
                    format.properties().get(&href).and_then(PropertyValue::as_string),
                    Some(*expected_href)
                );
            }
            None => assert!(run.formats().is_empty()),
        }
    }
    Ok(())
}

fn assert_caret(state: &EditorState, expected: &Point) -> TestResult {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(test_error("result selection is missing").into());
    };
    assert_eq!(range.anchor(), expected);
    assert_eq!(range.focus(), expected);
    Ok(())
}

#[test]
fn collapsed_typed_pending_format_is_consumed_then_inherited_and_replays_exactly() -> TestResult {
    let schema = typed_schema()?;
    let context = EditorContext::new(schema, DocumentLimits::default());
    let registry = base_action_registry()?;
    let pending = link_formats("new")?;
    let initial_selection = collapsed(text_point(0, 0, 1, Affinity::After)?);
    let initial = state(
        &context,
        &[paragraph_value(&[plain("ab")])],
        Some(initial_selection.clone()),
        Some(pending.clone()),
        "insert-typed-pending-replay",
    )?;
    let initial_copy = initial.clone();
    let mut session = EditorSession::new(initial);

    let first = registry.prepare(session.state(), &invocation("🙂")?)?;
    let ActionPreparation::Enabled(first_plan) = &first else {
        return Err(test_error("typed pending insertion was disabled").into());
    };
    let first_splice = only_splice(first_plan.transaction().operations())?;
    assert!(first_splice.expected_removed().is_empty());
    let first_replacement = first_splice
        .replacement()
        .iter()
        .next()
        .ok_or_else(|| test_error("first replacement is empty"))?;
    assert_eq!(first_replacement.text(), "🙂");
    assert_eq!(first_replacement.formats(), &pending);

    let first_commit = session.execute_prepared_action(first)?;
    assert!(matches!(first_commit.forward_operations(), [Operation::TextSplice(_)]));
    assert_runs(session.state().document(), &[("a", None), ("🙂", Some("new")), ("b", None)])?;
    assert_eq!(session.state().pending_formats(), None);
    assert_caret(session.state(), &text_point(0, 2, 0, Affinity::Before)?)?;

    let second = registry.prepare(session.state(), &invocation("!")?)?;
    let ActionPreparation::Enabled(second_plan) = &second else {
        return Err(test_error("contextual insertion was disabled").into());
    };
    let second_splice = only_splice(second_plan.transaction().operations())?;
    let second_replacement = second_splice
        .replacement()
        .iter()
        .next()
        .ok_or_else(|| test_error("second replacement is empty"))?;
    assert_eq!(second_replacement.text(), "!");
    assert_eq!(second_replacement.formats(), &pending);

    session.execute_prepared_action(second)?;
    assert_runs(session.state().document(), &[("a", None), ("🙂!", Some("new")), ("b", None)])?;
    assert_eq!(session.state().pending_formats(), None);
    assert_caret(session.state(), &text_point(0, 2, 0, Affinity::Before)?)?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    let final_state = session.state().clone();

    let Some(undo) = session.undo()? else {
        return Err(test_error("merged typed insertion was not undoable").into());
    };
    assert_eq!(undo.after().document(), initial_copy.document());
    assert_eq!(undo.after().selection(), Some(&initial_selection));
    assert_eq!(undo.after().pending_formats(), Some(&pending));
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let Some(redo) = session.redo()? else {
        return Err(test_error("merged typed insertion was not redoable").into());
    };
    assert_eq!(redo.after().document(), final_state.document());
    assert_eq!(redo.after().selection(), final_state.selection());
    assert_eq!(redo.after().pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    Ok(())
}

#[test]
fn split_property_owners_accept_exact_limits_and_disable_at_first_excess() -> TestResult {
    let schema = typed_schema()?;
    let registry = base_action_registry()?;
    let selection = Some(collapsed(text_point(0, 0, 1, Affinity::After)?));
    let pending = link_formats("new")?;

    let exact_context = EditorContext::new(
        schema.clone(),
        DocumentLimits::default()
            .with_max_property_values(3)
            .with_max_total_property_string_bytes(9),
    );
    let exact = state(
        &exact_context,
        &[paragraph_value(&[linked("ab", "old")])],
        selection.clone(),
        Some(pending.clone()),
        "insert-property-exact-limit",
    )?;
    let exact_preparation = registry.prepare(&exact, &invocation("X")?)?;
    let ActionPreparation::Enabled(exact_plan) = &exact_preparation else {
        return Err(test_error("exact property budget insertion was disabled").into());
    };
    assert!(only_splice(exact_plan.transaction().operations())?.expected_removed().is_empty());
    let exact_commit = exact_preparation.execute(&exact)?;
    assert_runs(
        exact_commit.after().document(),
        &[("a", Some("old")), ("X", Some("new")), ("b", Some("old"))],
    )?;
    assert_eq!(exact_commit.after().document().summary().property_value_count(), 3);
    assert_eq!(exact_commit.after().document().summary().total_property_string_bytes(), 9);

    let value_excess_context = EditorContext::new(
        schema.clone(),
        DocumentLimits::default()
            .with_max_property_values(2)
            .with_max_total_property_string_bytes(9),
    );
    let value_excess = state(
        &value_excess_context,
        &[paragraph_value(&[linked("ab", "old")])],
        selection.clone(),
        Some(pending.clone()),
        "insert-property-value-excess",
    )?;
    assert_disabled(&registry, &value_excess, "X", "breditor/result-limit-exceeded")?;

    let string_excess_context = EditorContext::new(
        schema,
        DocumentLimits::default()
            .with_max_property_values(3)
            .with_max_total_property_string_bytes(8),
    );
    let string_excess = state(
        &string_excess_context,
        &[paragraph_value(&[linked("ab", "old")])],
        selection,
        Some(pending),
        "insert-property-string-excess",
    )?;
    assert_disabled(&registry, &string_excess, "X", "breditor/result-limit-exceeded")?;
    Ok(())
}

#[test]
fn typed_cross_paragraph_insert_is_closed_while_property_free_behavior_is_preserved() -> TestResult
{
    let registry = base_action_registry()?;
    let cross_selection = Some(selected(
        text_point(0, 0, 0, Affinity::Before)?,
        text_point(1, 0, 1, Affinity::After)?,
    ));

    let typed_context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let typed = state(
        &typed_context,
        &[paragraph_value(&[plain("a")]), paragraph_value(&[plain("b")])],
        cross_selection.clone(),
        None,
        "insert-typed-cross-disabled",
    )?;
    assert_disabled(&registry, &typed, "X", "breditor/unsupported-schema")?;

    let base_context = EditorContext::default();
    let base = state(
        &base_context,
        &[paragraph_value(&[plain("a")]), paragraph_value(&[plain("b")])],
        cross_selection,
        None,
        "insert-base-cross-preserved",
    )?;
    let base_preparation = registry.prepare(&base, &invocation("X")?)?;
    let ActionPreparation::Enabled(base_plan) = base_preparation else {
        return Err(test_error("property-free cross-paragraph insertion was disabled").into());
    };
    assert!(matches!(base_plan.transaction().operations(), [Operation::RootTextReplace(_)]));
    Ok(())
}
