//! Black-box history contracts for registration-owned property-aware inline formatting.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionId, ActionInput, ActionInvocation, ActionPreparation, ActionRegistration,
        ActionRegistry, ActionValue,
        builtins::{SetInlineFormatAction, set_inline_format_input_contract},
    },
    codec::DocumentJsonCodecV2,
    document::{Document, Format, FormatSet, PropertyValue, TextFragment, TextRun},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{TextRange, TextSplice},
    position::{Affinity, Point, TextOffset},
    schema::{CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaId, SchemaVersion},
    selection::{RangeSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId},
    transaction::{
        Commit, HistoryIntent, PendingFormatsUpdate, SelectionUpdate, Transaction,
        TransactionMetadata,
    },
};
use serde_json::{Value, json};
use support::{TestResult, path, test_error};

const LINK: &str = "example/link";
const HREF: &str = "example/href";
const LABEL: &str = "example/label";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn action_id() -> Result<ActionId, Box<dyn Error>> {
    ActionId::try_new("example/set-link").map_err(Into::into)
}

fn typed_schema() -> Result<CompiledSchema, Box<dyn Error>> {
    let contract = InlineFormatPropertyContractV1::try_new(
        name(LINK)?,
        vec![
            InlineFormatPropertySpecV1::new(
                name(HREF)?,
                PropertyPresenceV1::Required,
                InlineFormatPropertyTypeV1::try_string(1, 2_048)?,
            ),
            InlineFormatPropertySpecV1::new(
                name(LABEL)?,
                PropertyPresenceV1::Optional,
                InlineFormatPropertyTypeV1::try_string(0, 128)?,
            ),
        ],
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

fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    ActionRegistry::try_new(vec![ActionRegistration::with_input(
        action_id()?,
        set_inline_format_input_contract(),
        SetInlineFormatAction::new(name(LINK)?),
    )])
    .map_err(Into::into)
}

fn run_value(text: &str, formats: &[Value]) -> Value {
    json!({ "kind": "text", "text": text, "formats": formats })
}

fn plain(text: &str) -> Value {
    run_value(text, &[])
}

fn linked(text: &str, href: &str, label: Option<&str>) -> Value {
    let mut properties = serde_json::Map::new();
    properties.insert(HREF.to_owned(), json!(href));
    if let Some(label) = label {
        properties.insert(LABEL.to_owned(), json!(label));
    }
    run_value(text, &[json!({ "type": LINK, "properties": Value::Object(properties) })])
}

fn paragraph(runs: &[Value]) -> Value {
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
    lineage: &str,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodecV2::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&document_json(context.schema(), paragraphs))?;
    EditorState::try_new(context, LineageId::try_new(lineage)?, document, Some(selection), None)
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

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn collapsed(point: Point) -> Selection {
    selected(point.clone(), point)
}

fn object(entries: Vec<(&str, ActionValue)>) -> Result<ActionValue, Box<dyn Error>> {
    ActionValue::try_object(
        entries.into_iter().map(|(key, value)| (key.to_owned(), value)).collect(),
    )
    .map_err(Into::into)
}

fn property_entry(name: &str, value: ActionValue) -> Result<ActionValue, Box<dyn Error>> {
    object(vec![("name", ActionValue::try_from_string(name)?), ("value", value)])
}

fn set_input(properties: Vec<(&str, &str)>) -> Result<ActionInput, Box<dyn Error>> {
    let properties = properties
        .into_iter()
        .map(|(property_name, value)| {
            property_entry(property_name, ActionValue::try_from_string(value)?)
        })
        .collect::<Result<Vec<_>, Box<dyn Error>>>()?;
    let value = object(vec![
        ("operation", ActionValue::try_from_string("set")?),
        ("properties", ActionValue::try_array(properties)?),
    ])?;
    Ok(ActionInput::typed(set_inline_format_input_contract(), value))
}

fn set_href_input(href: &str) -> Result<ActionInput, Box<dyn Error>> {
    set_input(vec![(HREF, href)])
}

fn remove_input() -> Result<ActionInput, Box<dyn Error>> {
    Ok(ActionInput::typed(
        set_inline_format_input_contract(),
        object(vec![("operation", ActionValue::try_from_string("remove")?)])?,
    ))
}

fn execute(
    session: &mut EditorSession,
    registry: &ActionRegistry,
    input: ActionInput,
) -> Result<Commit, Box<dyn Error>> {
    let preparation =
        registry.prepare(session.state(), &ActionInvocation::new(action_id()?, input))?;
    if let ActionPreparation::Disabled(disabled) = &preparation {
        return Err(test_error(format!(
            "set-inline-format unexpectedly disabled: {}",
            disabled.reason().code()
        ))
        .into());
    }
    session.execute_prepared_action(preparation).map_err(Into::into)
}

fn history_commit(result: Option<Commit>, direction: &str) -> Result<Commit, Box<dyn Error>> {
    result.ok_or_else(|| test_error(format!("{direction} was unexpectedly unavailable")).into())
}

fn assert_values(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.context(), expected.context());
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

fn text_format(document: &Document, run_index: usize) -> Result<Option<&Format>, Box<dyn Error>> {
    let format_kind = name(LINK)?;
    Ok(document
        .root()
        .as_element()
        .and_then(|root| root.children().get(0))
        .and_then(breditor_core::document::NodeRef::as_element)
        .and_then(|paragraph| paragraph.children().get(run_index))
        .and_then(breditor_core::document::NodeRef::as_text)
        .and_then(|text| text.formats().get(&format_kind)))
}

fn string_property<'a>(format: &'a Format, property: &str) -> Option<&'a str> {
    format
        .properties()
        .get(&QualifiedName::try_new(property).ok()?)
        .and_then(PropertyValue::as_string)
}

fn pending_link(state: &EditorState) -> Result<Option<&Format>, Box<dyn Error>> {
    let kind = name(LINK)?;
    Ok(state.pending_formats().and_then(|formats| formats.get(&kind)))
}

fn set_selection(
    session: &mut EditorSession,
    selection: Selection,
) -> Result<Commit, Box<dyn Error>> {
    let transaction = Transaction::new(session.state(), Vec::new())
        .with_selection_update(SelectionUpdate::Set(Some(selection)))
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Record));
    session
        .apply_transaction(&transaction)?
        .into_commit()
        .ok_or_else(|| test_error("selection update was unexpectedly unchanged").into())
}

fn insertion(
    state: &EditorState,
    offset: u64,
    text: &str,
    selection: Selection,
    group: QualifiedName,
) -> Result<Transaction, Box<dyn Error>> {
    let offset = TextOffset::try_new(offset)?;
    let range = TextRange::try_new(path(&[0])?, offset, offset)?;
    let fragment: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, fragment)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_selection_update(SelectionUpdate::Set(Some(selection)))
        .with_pending_formats_update(PendingFormatsUpdate::Set(None))
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Merge { group })))
}

fn apply(session: &mut EditorSession, transaction: &Transaction) -> Result<Commit, Box<dyn Error>> {
    session
        .apply_transaction(transaction)?
        .into_commit()
        .ok_or_else(|| test_error("transaction was unexpectedly unchanged").into())
}

#[test]
fn range_set_is_one_exact_undo_unit_and_redo_restores_the_result_selection() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = registry()?;
    let initial_selection =
        selected(text_point(0, 0, 5, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?);
    let initial = state(
        &context,
        &[paragraph(&[plain("abcdef")])],
        initial_selection,
        "set-link-range-history",
    )?;
    let mut session = EditorSession::new(initial.clone());

    let set = execute(&mut session, &registry, set_href_input("https://range.test")?)?;
    let result = set.after().clone();
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    let undo = history_commit(session.undo()?, "undo")?;
    assert_values(undo.after(), &initial);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let redo = history_commit(session.redo()?, "redo")?;
    assert_values(redo.after(), &result);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn complete_property_replacement_and_removal_replay_then_new_set_invalidates_redo() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = registry()?;
    let initial = state(
        &context,
        &[paragraph(&[linked("x", "https://old.test", Some("old label"))])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        "set-link-property-history",
    )?;
    let mut session = EditorSession::new(initial.clone());

    let replacement =
        execute(&mut session, &registry, set_href_input("https://replacement.test")?)?
            .after()
            .clone();
    let replaced_format = text_format(replacement.document(), 0)?
        .ok_or_else(|| test_error("replacement link is missing"))?;
    assert_eq!(replaced_format.properties().len(), 1);
    assert_eq!(string_property(replaced_format, HREF), Some("https://replacement.test"));
    assert_eq!(string_property(replaced_format, LABEL), None);

    let removed = execute(&mut session, &registry, remove_input()?)?.after().clone();
    assert!(text_format(removed.document(), 0)?.is_none());
    assert_eq!((session.undo_depth(), session.redo_depth()), (2, 0));

    let undo_remove = history_commit(session.undo()?, "remove undo")?;
    assert_values(undo_remove.after(), &replacement);
    let undo_replace = history_commit(session.undo()?, "replacement undo")?;
    assert_values(undo_replace.after(), &initial);

    let redo_replace = history_commit(session.redo()?, "replacement redo")?;
    assert_values(redo_replace.after(), &replacement);
    let redo_remove = history_commit(session.redo()?, "remove redo")?;
    assert_values(redo_remove.after(), &removed);

    let back_to_replacement = history_commit(session.undo()?, "branch undo")?;
    assert_values(back_to_replacement.after(), &replacement);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 1));

    let branched = execute(&mut session, &registry, set_href_input("https://branch.test")?)?;
    let branched_format = text_format(branched.after().document(), 0)?
        .ok_or_else(|| test_error("branched link is missing"))?;
    assert_eq!(string_property(branched_format, HREF), Some("https://branch.test"));
    assert_eq!((session.undo_depth(), session.redo_depth()), (2, 0));
    assert!(session.redo()?.is_none());
    assert_values(session.state(), branched.after());
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn collapsed_pending_changes_are_ephemeral_exact_history_boundaries() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = registry()?;
    let initial = state(
        &context,
        &[paragraph(&[plain("x")])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        "set-link-pending-history",
    )?;
    let mut session = EditorSession::new(initial.clone());
    let _ = execute(&mut session, &registry, set_href_input("https://document.test")?)?;

    let caret = collapsed(text_point(0, 0, 1, Affinity::After)?);
    let _ = set_selection(&mut session, caret.clone())?;
    let pending_set = execute(&mut session, &registry, set_href_input("https://pending.test")?)?;
    assert!(pending_set.forward_operations().is_empty());
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    let set_boundary = session.state().clone();
    let pending = pending_link(&set_boundary)?.ok_or_else(|| test_error("pending link missing"))?;
    assert_eq!(string_property(pending, HREF), Some("https://pending.test"));

    let set_undo = history_commit(session.undo()?, "pending-set boundary undo")?;
    assert_values(set_undo.after(), &initial);
    let set_redo = history_commit(session.redo()?, "pending-set boundary redo")?;
    assert_values(set_redo.after(), &set_boundary);

    let pending_remove = execute(&mut session, &registry, remove_input()?)?;
    assert!(pending_remove.forward_operations().is_empty());
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    let remove_boundary = session.state().clone();
    assert!(remove_boundary.pending_formats().is_some_and(FormatSet::is_empty));

    let _ = history_commit(session.undo()?, "pending-remove boundary undo")?;
    let remove_redo = history_commit(session.redo()?, "pending-remove boundary redo")?;
    assert_values(remove_redo.after(), &remove_boundary);

    let _ = history_commit(session.undo()?, "redo-preservation setup undo")?;
    let _ = set_selection(&mut session, caret)?;
    let _ = execute(&mut session, &registry, set_href_input("https://pending-before.test")?)?;
    let before_remove = execute(&mut session, &registry, remove_input()?)?;
    assert!(before_remove.forward_operations().is_empty());
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));
    let before_boundary = session.state().clone();

    let _ = history_commit(session.redo()?, "preserved redo")?;
    let restored_before = history_commit(session.undo()?, "updated before-boundary undo")?;
    assert_values(restored_before.after(), &before_boundary);
    Ok(())
}

#[test]
fn collapsed_pending_change_closes_an_open_content_merge_group() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = registry()?;
    let initial = state(
        &context,
        &[paragraph(&[plain("a")])],
        collapsed(text_point(0, 0, 1, Affinity::After)?),
        "set-link-pending-merge-boundary",
    )?;
    let mut session = EditorSession::new(initial);
    let group = name("example/typing")?;

    let first = insertion(
        session.state(),
        1,
        "b",
        collapsed(text_point(0, 0, 2, Affinity::After)?),
        group.clone(),
    )?;
    let _ = apply(&mut session, &first)?;
    assert_eq!(session.undo_depth(), 1);

    let pending = execute(&mut session, &registry, set_href_input("https://pending.test")?)?;
    assert!(pending.forward_operations().is_empty());
    assert_eq!(session.undo_depth(), 1);

    let second = insertion(
        session.state(),
        2,
        "c",
        collapsed(text_point(0, 0, 3, Affinity::After)?),
        group,
    )?;
    let _ = apply(&mut session, &second)?;
    assert_eq!(session.undo_depth(), 2);
    Ok(())
}
