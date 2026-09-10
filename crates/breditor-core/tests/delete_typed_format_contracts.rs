//! Property-aware contracts for paragraph-local semantic deletion.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionId, ActionInvocation, ActionPreparation, ActionRegistry, PreparedAction,
        builtins::{
            base_action_registry, delete_backward_action_id, delete_forward_action_id,
            delete_selection_action_id,
        },
    },
    codec::DocumentJsonCodecV2,
    document::{Document, Format, FormatSet, PropertyMap, PropertyValue, TextFragment, TextRun},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, TextSplice},
    position::{Affinity, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::Commit,
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

fn formats(href: Option<&str>) -> Result<FormatSet, Box<dyn Error>> {
    let Some(href) = href else {
        return Ok(FormatSet::default());
    };
    let properties =
        PropertyMap::try_from_sorted(vec![(name(HREF)?, PropertyValue::from_string(href))])?;
    FormatSet::try_from_formats(vec![Format::new(name(LINK)?, properties)]).map_err(Into::into)
}

fn fragment(runs: &[(&str, Option<&str>)]) -> Result<TextFragment, Box<dyn Error>> {
    TextFragment::try_from_runs(
        runs.iter()
            .map(|(text, href)| TextRun::try_new(*text, formats(*href)?).map_err(Into::into))
            .collect::<Result<Vec<_>, Box<dyn Error>>>()?,
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

fn collapsed(point: Point) -> Selection {
    RangeSelection::new(point.clone(), point).into()
}

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn invocation(id: &ActionId) -> ActionInvocation {
    ActionInvocation::without_input(id.clone())
}

fn enabled(
    registry: &ActionRegistry,
    state: &EditorState,
    id: &ActionId,
) -> Result<PreparedAction, Box<dyn Error>> {
    match registry.prepare(state, &invocation(id))? {
        ActionPreparation::Enabled(prepared) => Ok(prepared),
        ActionPreparation::Disabled(prepared) => Err(test_error(format!(
            "{} unexpectedly disabled: {}",
            id.as_str(),
            prepared.reason().code()
        ))
        .into()),
    }
}

fn assert_disabled(
    registry: &ActionRegistry,
    state: &EditorState,
    id: &ActionId,
    expected_code: &str,
) -> TestResult {
    let original = state.clone();
    let ActionPreparation::Disabled(prepared) = registry.prepare(state, &invocation(id))? else {
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

fn assert_exact_inverse(commit: &Commit) -> TestResult {
    let forward = only_splice(commit.forward_operations())?;
    let inverse = only_splice(commit.inverse_operations())?;
    assert!(forward.replacement().is_empty());
    assert_eq!(inverse.range().container_path(), forward.range().container_path());
    assert_eq!(inverse.range().start(), forward.range().start());
    assert_eq!(inverse.range().end(), forward.range().start());
    assert!(inverse.expected_removed().is_empty());
    assert_eq!(inverse.replacement(), forward.expected_removed());
    Ok(())
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
                    .ok_or_else(|| test_error("linked run is missing its format"))?;
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

fn assert_same_editor_value(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.context(), expected.context());
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

#[test]
fn selection_delete_inside_a_typed_run_has_an_exact_inverse_and_replays() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = base_action_registry()?;
    let action = delete_selection_action_id();
    let initial_selection =
        selected(text_point(0, 0, 3, Affinity::After)?, text_point(0, 0, 1, Affinity::Before)?);
    let initial = state(
        &context,
        &[paragraph_value(&[linked("abcd", "old")])],
        initial_selection,
        None,
        "delete-typed-selection-inside",
    )?;
    let initial_value = initial.clone();
    let mut session = EditorSession::new(initial);

    let prepared = enabled(&registry, session.state(), &action)?;
    let splice = only_splice(prepared.transaction().operations())?;
    assert_eq!(splice.range().start(), TextOffset::try_new(1)?);
    assert_eq!(splice.range().end(), TextOffset::try_new(3)?);
    assert_eq!(splice.expected_removed(), &fragment(&[("bc", Some("old"))])?);
    assert!(splice.replacement().is_empty());

    let commit = session.execute_prepared_action(ActionPreparation::Enabled(prepared))?;
    assert_exact_inverse(&commit)?;
    assert_runs(session.state().document(), &[("ad", Some("old"))])?;
    assert_caret(session.state(), &text_point(0, 0, 1, Affinity::After)?)?;
    let final_value = session.state().clone();

    let Some(undo) = session.undo()? else {
        return Err(test_error("typed selection deletion was not undoable").into());
    };
    assert_eq!(undo.forward_operations(), commit.inverse_operations());
    assert_same_editor_value(session.state(), &initial_value);

    let Some(redo) = session.redo()? else {
        return Err(test_error("typed selection deletion was not redoable").into());
    };
    assert_eq!(redo.forward_operations(), commit.forward_operations());
    assert_same_editor_value(session.state(), &final_value);
    Ok(())
}

#[test]
fn every_extended_delete_route_preserves_properties_across_typed_runs() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = base_action_registry()?;
    let selection =
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(0, 2, 1, Affinity::After)?);
    let expected_removed = fragment(&[("b", Some("old")), ("CD", Some("new")), ("e", None)])?;

    for action in
        [delete_selection_action_id(), delete_backward_action_id(), delete_forward_action_id()]
    {
        let initial = state(
            &context,
            &[paragraph_value(&[linked("ab", "old"), linked("CD", "new"), plain("ef")])],
            selection.clone(),
            None,
            &format!("delete-typed-across-{}", action.as_str().replace('/', "-")),
        )?;
        let prepared = enabled(&registry, &initial, &action)?;
        let splice = only_splice(prepared.transaction().operations())?;
        assert_eq!(splice.range().start(), TextOffset::try_new(1)?);
        assert_eq!(splice.range().end(), TextOffset::try_new(5)?);
        assert_eq!(splice.expected_removed(), &expected_removed);
        let commit = prepared.execute(&initial)?;
        assert_exact_inverse(&commit)?;
        assert_runs(commit.after().document(), &[("a", Some("old")), ("f", None)])?;
        assert_caret(commit.after(), &text_point(0, 1, 0, Affinity::After)?)?;
        assert_eq!(commit.after().pending_formats(), None);
    }
    Ok(())
}

#[test]
fn directional_delete_removes_one_grapheme_across_typed_run_seams_and_replays() -> TestResult {
    struct Case {
        action: ActionId,
        caret: Point,
        result_affinity: Affinity,
        lineage: &'static str,
    }

    let cases = [
        Case {
            action: delete_forward_action_id(),
            caret: text_point(0, 0, 0, Affinity::After)?,
            result_affinity: Affinity::Before,
            lineage: "delete-typed-grapheme-forward",
        },
        Case {
            action: delete_backward_action_id(),
            caret: text_point(0, 1, 1, Affinity::After)?,
            result_affinity: Affinity::After,
            lineage: "delete-typed-grapheme-backward",
        },
    ];
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = base_action_registry()?;
    let expected_removed = fragment(&[("e", Some("base")), ("\u{301}", Some("mark"))])?;
    let pending = formats(Some("pending"))?;

    for case in cases {
        let initial = state(
            &context,
            &[paragraph_value(&[linked("e", "base"), linked("\u{301}", "mark"), plain("x")])],
            collapsed(case.caret),
            Some(pending.clone()),
            case.lineage,
        )?;
        let initial_value = initial.clone();
        let mut session = EditorSession::new(initial);
        let prepared = enabled(&registry, session.state(), &case.action)?;
        let splice = only_splice(prepared.transaction().operations())?;
        assert_eq!(splice.range().start(), TextOffset::ZERO);
        assert_eq!(splice.range().end(), TextOffset::try_new(2)?);
        assert_eq!(splice.expected_removed(), &expected_removed);

        let commit = session.execute_prepared_action(ActionPreparation::Enabled(prepared))?;
        assert_exact_inverse(&commit)?;
        assert_runs(session.state().document(), &[("x", None)])?;
        assert_caret(session.state(), &text_point(0, 0, 0, case.result_affinity)?)?;
        assert_eq!(session.state().pending_formats(), Some(&pending));
        let final_value = session.state().clone();

        let Some(undo) = session.undo()? else {
            return Err(test_error("typed grapheme deletion was not undoable").into());
        };
        assert_eq!(undo.forward_operations(), commit.inverse_operations());
        assert_same_editor_value(session.state(), &initial_value);
        let Some(redo) = session.redo()? else {
            return Err(test_error("typed grapheme deletion was not redoable").into());
        };
        assert_eq!(redo.forward_operations(), commit.forward_operations());
        assert_same_editor_value(session.state(), &final_value);
    }
    Ok(())
}

#[test]
fn typed_structural_delete_routes_preserve_properties_and_replay() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = base_action_registry()?;
    for action in
        [delete_selection_action_id(), delete_backward_action_id(), delete_forward_action_id()]
    {
        let initial_selection =
            selected(text_point(1, 0, 1, Affinity::After)?, text_point(0, 0, 1, Affinity::Before)?);
        let initial = state(
            &context,
            &[paragraph_value(&[linked("ab", "left")]), paragraph_value(&[linked("cd", "right")])],
            initial_selection,
            None,
            &format!("delete-typed-cross-{}", action.as_str().replace('/', "-")),
        )?;
        let initial_value = initial.clone();
        let mut session = EditorSession::new(initial);
        let prepared = enabled(&registry, session.state(), &action)?;
        assert!(matches!(prepared.transaction().operations(), [Operation::RootTextReplace(_)]));
        let commit = session.execute_prepared_action(ActionPreparation::Enabled(prepared))?;
        assert!(matches!(commit.inverse_operations(), [Operation::RootTextReplace(_)]));
        assert_runs(session.state().document(), &[("a", Some("left")), ("d", Some("right"))])?;
        assert_caret(session.state(), &text_point(0, 1, 0, Affinity::After)?)?;
        assert_eq!(session.state().pending_formats(), None);
        let final_value = session.state().clone();

        let Some(undo) = session.undo()? else {
            return Err(test_error("typed structural deletion was not undoable").into());
        };
        assert_eq!(undo.forward_operations(), commit.inverse_operations());
        assert_same_editor_value(session.state(), &initial_value);
        let Some(redo) = session.redo()? else {
            return Err(test_error("typed structural deletion was not redoable").into());
        };
        assert_eq!(redo.forward_operations(), commit.forward_operations());
        assert_same_editor_value(session.state(), &final_value);
    }

    let paragraphs = [paragraph_value(&[linked("a", "left")]), paragraph_value(&[plain("b")])];
    let pending = formats(Some("pending"))?;
    let backward_boundary = state(
        &context,
        &paragraphs,
        collapsed(text_point(1, 0, 0, Affinity::Before)?),
        Some(pending.clone()),
        "delete-typed-backward-boundary",
    )?;
    let backward = enabled(&registry, &backward_boundary, &delete_backward_action_id())?
        .execute(&backward_boundary)?;
    assert!(matches!(backward.forward_operations(), [Operation::ParagraphJoin(_)]));
    assert!(matches!(backward.inverse_operations(), [Operation::ParagraphSplit(_)]));
    assert_runs(backward.after().document(), &[("a", Some("left")), ("b", None)])?;
    assert_caret(backward.after(), &text_point(0, 1, 0, Affinity::After)?)?;
    assert_eq!(backward.after().pending_formats(), Some(&pending));

    let forward_boundary = state(
        &context,
        &paragraphs,
        collapsed(text_point(0, 0, 1, Affinity::After)?),
        Some(pending.clone()),
        "delete-typed-forward-boundary",
    )?;
    let forward = enabled(&registry, &forward_boundary, &delete_forward_action_id())?
        .execute(&forward_boundary)?;
    assert!(matches!(forward.forward_operations(), [Operation::ParagraphJoin(_)]));
    assert!(matches!(forward.inverse_operations(), [Operation::ParagraphSplit(_)]));
    assert_runs(forward.after().document(), &[("a", Some("left")), ("b", None)])?;
    assert_caret(forward.after(), &text_point(0, 1, 0, Affinity::Before)?)?;
    assert_eq!(forward.after().pending_formats(), Some(&pending));

    let zero_budget = EditorContext::new(typed_schema()?, DocumentLimits::default())
        .with_max_operations_per_transaction(0);
    let at_start = state(
        &zero_budget,
        &[paragraph_value(&[linked("a", "left")])],
        collapsed(text_point(0, 0, 0, Affinity::Before)?),
        None,
        "delete-typed-zero-budget",
    )?;
    assert_disabled(
        &registry,
        &at_start,
        &delete_backward_action_id(),
        "breditor/operation-budget-exceeded",
    )?;
    Ok(())
}
