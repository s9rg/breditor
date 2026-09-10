//! History and durable replay contracts for clear-inline-formats.

mod support;

use std::error::Error;

use breditor_core::{
    action::{
        ActionInvocation, ActionPreparation, ActionRegistration, ActionRegistry,
        builtins::{ClearInlineFormatsAction, clear_inline_formats_action_id},
    },
    codec::{DocumentJsonCodecV2, SessionCheckpointJsonCodecV3, SessionCheckpointLimits},
    document::{Format, FormatSet, PropertyMap, PropertyValue, TextFragment, TextRun},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatPropertyContractV1, InlineFormatPropertySpecV1, InlineFormatPropertyTypeV1,
        InlineFormatSpecV1, PropertyPresenceV1,
    },
    identity::QualifiedName,
    operation::{Operation, TextRange, TextSplice},
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

const STRONG: &str = "breditor/strong";
const LINK: &str = "example/link";
const HREF: &str = "example/href";
const LABEL: &str = "example/label";

#[derive(Clone, Copy)]
struct Run<'a> {
    text: &'a str,
    strong: bool,
    href: Option<&'a str>,
    label: Option<&'a str>,
}

impl<'a> Run<'a> {
    const fn strong(text: &'a str) -> Self {
        Self { text, strong: true, href: None, label: None }
    }

    const fn linked(text: &'a str, href: &'a str) -> Self {
        Self { text, strong: false, href: Some(href), label: None }
    }

    const fn with_label(mut self, label: &'a str) -> Self {
        self.label = Some(label);
        self
    }

    const fn with_strong(mut self) -> Self {
        self.strong = true;
        self
    }
}

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn typed_schema() -> Result<CompiledSchema, Box<dyn Error>> {
    let link_contract = InlineFormatPropertyContractV1::try_new(
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
        ExtensionId::new(name("example/clear-history-extension")?, ExtensionVersion::one()),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(name(LINK)?, PersistedTypeRevision::one())],
        vec![link_contract],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name("example/clear-history-profile")?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn registry() -> Result<ActionRegistry, Box<dyn Error>> {
    ActionRegistry::try_new(vec![ActionRegistration::new(
        clear_inline_formats_action_id(),
        ClearInlineFormatsAction,
    )])
    .map_err(Into::into)
}

fn run_value(run: Run<'_>) -> Value {
    let mut formats = Vec::new();
    if run.strong {
        formats.push(json!({ "type": STRONG, "properties": {} }));
    }
    if let Some(href) = run.href {
        let mut properties = serde_json::Map::new();
        properties.insert(HREF.to_owned(), json!(href));
        if let Some(label) = run.label {
            properties.insert(LABEL.to_owned(), json!(label));
        }
        formats.push(json!({ "type": LINK, "properties": properties }));
    }
    json!({ "kind": "text", "text": run.text, "formats": formats })
}

fn paragraph_value(runs: &[Run<'_>]) -> Value {
    json!({
        "kind": "element",
        "type": "breditor/paragraph",
        "entityId": null,
        "properties": {},
        "children": runs.iter().copied().map(run_value).collect::<Vec<_>>(),
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

fn formats(run: Run<'_>) -> Result<FormatSet, Box<dyn Error>> {
    let mut values = Vec::new();
    if run.strong {
        values.push(Format::new(name(STRONG)?, PropertyMap::default()));
    }
    if let Some(href) = run.href {
        let mut properties = vec![(name(HREF)?, PropertyValue::from_string(href))];
        if let Some(label) = run.label {
            properties.push((name(LABEL)?, PropertyValue::from_string(label)));
        }
        values.push(Format::new(name(LINK)?, PropertyMap::try_from_sorted(properties)?));
    }
    FormatSet::try_from_formats(values).map_err(Into::into)
}

fn execute(
    session: &mut EditorSession,
    registry: &ActionRegistry,
) -> Result<Commit, Box<dyn Error>> {
    let preparation = registry.prepare(
        session.state(),
        &ActionInvocation::without_input(clear_inline_formats_action_id()),
    )?;
    if let ActionPreparation::Disabled(disabled) = &preparation {
        return Err(test_error(format!(
            "clear-inline-formats unexpectedly disabled: {}",
            disabled.reason().code()
        ))
        .into());
    }
    session.execute_prepared_action(preparation).map_err(Into::into)
}

fn assert_value(actual: &EditorState, expected: &EditorState) {
    assert_eq!(actual.context(), expected.context());
    assert_eq!(actual.document(), expected.document());
    assert_eq!(actual.selection(), expected.selection());
    assert_eq!(actual.pending_formats(), expected.pending_formats());
}

fn history_commit(result: Option<Commit>, direction: &str) -> Result<Commit, Box<dyn Error>> {
    result.ok_or_else(|| test_error(format!("{direction} was unexpectedly unavailable")).into())
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
    insertion_formats: FormatSet,
    selection: Selection,
    group: QualifiedName,
) -> Result<Transaction, Box<dyn Error>> {
    let offset = TextOffset::try_new(offset)?;
    let range = TextRange::try_new(path(&[0])?, offset, offset)?;
    let fragment: TextFragment = TextRun::try_new(text, insertion_formats)?.into();
    let splice = TextSplice::capture(state.context(), state.document(), range, fragment)?;
    Ok(Transaction::new(state, vec![splice.into()])
        .with_selection_update(SelectionUpdate::Set(Some(selection)))
        .with_pending_formats_update(PendingFormatsUpdate::Preserve)
        .with_metadata(TransactionMetadata::new(None, HistoryIntent::Merge { group })))
}

fn apply(session: &mut EditorSession, transaction: &Transaction) -> Result<Commit, Box<dyn Error>> {
    session
        .apply_transaction(transaction)?
        .into_commit()
        .ok_or_else(|| test_error("transaction was unexpectedly unchanged").into())
}

#[test]
fn same_paragraph_clear_is_one_exact_undo_unit_and_redo_restores_result_state() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = registry()?;
    let selection =
        selected(text_point(0, 0, 2, Affinity::After)?, text_point(0, 0, 1, Affinity::Before)?);
    let initial = state(
        &context,
        &[paragraph_value(&[Run::linked("abc", "https://exact.test").with_label("exact label")])],
        selection,
        None,
        "clear-same-history",
    )?;
    let mut session = EditorSession::new(initial.clone());

    let clear = execute(&mut session, &registry)?;
    assert!(matches!(clear.forward_operations(), [Operation::TextSplice(_)]));
    assert!(matches!(clear.inverse_operations(), [Operation::TextSplice(_)]));
    let result = session.state().clone();
    assert_eq!(result.pending_formats(), None);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    let undo = history_commit(session.undo()?, "clear undo")?;
    assert_eq!(undo.forward_operations(), clear.inverse_operations());
    assert_value(undo.after(), &initial);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let redo = history_commit(session.redo()?, "clear redo")?;
    assert_eq!(redo.forward_operations(), clear.forward_operations());
    assert_value(redo.after(), &result);
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    Ok(())
}

#[test]
fn cross_paragraph_clear_is_one_unit_and_a_new_clear_invalidates_redo() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = registry()?;
    let initial = state(
        &context,
        &[
            paragraph_value(&[Run::linked("ab", "https://left.test").with_label("left")]),
            paragraph_value(&[]),
            paragraph_value(&[Run::strong("cd")]),
        ],
        selected(text_point(0, 0, 1, Affinity::Before)?, text_point(2, 0, 1, Affinity::After)?),
        None,
        "clear-cross-history-branch",
    )?;
    let mut session = EditorSession::new(initial.clone());
    let cross = execute(&mut session, &registry)?;
    assert!(matches!(cross.forward_operations(), [Operation::RootTextReplace(_)]));
    assert!(matches!(cross.inverse_operations(), [Operation::RootTextReplace(_)]));
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));

    history_commit(session.undo()?, "cross clear undo")?;
    assert_value(session.state(), &initial);
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let branch_selection =
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?);
    set_selection(&mut session, branch_selection)?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));
    let branch = execute(&mut session, &registry)?;
    assert!(matches!(branch.forward_operations(), [Operation::TextSplice(_)]));
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    assert!(session.redo()?.is_none());
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn collapsed_clear_is_an_ephemeral_boundary_that_closes_merge_and_is_replayed_exactly() -> TestResult
{
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = registry()?;
    let link = formats(Run::linked("", "https://typing.test").with_label("typing"))?;
    let initial = state(
        &context,
        &[paragraph_value(&[Run::linked("a", "https://typing.test").with_label("typing")])],
        collapsed(text_point(0, 0, 0, Affinity::After)?),
        None,
        "clear-collapsed-history-boundary",
    )?;
    let mut session = EditorSession::new(initial.clone());
    let group = name("example/typing")?;

    let first = insertion(
        session.state(),
        0,
        "b",
        link,
        collapsed(text_point(0, 0, 1, Affinity::After)?),
        group.clone(),
    )?;
    apply(&mut session, &first)?;
    assert_eq!(session.undo_depth(), 1);

    let clear = execute(&mut session, &registry)?;
    assert!(clear.forward_operations().is_empty());
    assert_eq!(clear.after().pending_formats(), Some(&FormatSet::default()));
    assert_eq!((session.undo_depth(), session.redo_depth()), (1, 0));
    let boundary = session.state().clone();

    let second = insertion(
        session.state(),
        1,
        "c",
        FormatSet::default(),
        collapsed(text_point(0, 1, 1, Affinity::After)?),
        group,
    )?;
    apply(&mut session, &second)?;
    assert_eq!(session.undo_depth(), 2);

    let second_undo = history_commit(session.undo()?, "post-boundary insertion undo")?;
    assert_value(second_undo.after(), &boundary);
    let first_undo = history_commit(session.undo()?, "pre-boundary insertion undo")?;
    assert_value(first_undo.after(), &initial);
    let first_redo = history_commit(session.redo()?, "pre-boundary insertion redo")?;
    assert_value(first_redo.after(), &boundary);
    Ok(())
}

#[test]
fn collapsed_clear_preserves_redo_and_updates_its_exact_before_boundary() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = registry()?;
    let initial = state(
        &context,
        &[paragraph_value(&[Run::linked("x", "https://redo.test").with_label("redo")])],
        selected(text_point(0, 0, 0, Affinity::Before)?, text_point(0, 0, 1, Affinity::After)?),
        None,
        "clear-collapsed-redo-boundary",
    )?;
    let mut session = EditorSession::new(initial);
    execute(&mut session, &registry)?;
    history_commit(session.undo()?, "range clear undo")?;
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));

    let caret = collapsed(text_point(0, 0, 1, Affinity::Before)?);
    set_selection(&mut session, caret)?;
    let pending_clear = execute(&mut session, &registry)?;
    assert!(pending_clear.forward_operations().is_empty());
    assert_eq!((session.undo_depth(), session.redo_depth()), (0, 1));
    let before_redo = session.state().clone();

    history_commit(session.redo()?, "preserved clear redo")?;
    let restored_before = history_commit(session.undo()?, "updated clear before-boundary undo")?;
    assert_value(restored_before.after(), &before_redo);
    Ok(())
}

#[test]
fn v3_checkpoint_restores_typed_cross_clear_on_both_history_branches() -> TestResult {
    let context = EditorContext::new(typed_schema()?, DocumentLimits::default());
    let registry = registry()?;
    let initial = state(
        &context,
        &[
            paragraph_value(&[Run::linked("ab", "https://left.test").with_label("left label")]),
            paragraph_value(&[]),
            paragraph_value(&[
                Run::linked("c", "https://middle.test").with_strong(),
                Run::linked("de", "https://right.test").with_label("right label"),
            ]),
        ],
        selected(text_point(2, 1, 1, Affinity::After)?, text_point(0, 0, 1, Affinity::Before)?),
        None,
        "clear-v3-checkpoint",
    )?;
    let initial_value = initial.clone();
    let mut session = EditorSession::new(initial);
    let clear = execute(&mut session, &registry)?;
    assert!(matches!(clear.forward_operations(), [Operation::RootTextReplace(_)]));
    let result = session.state().clone();
    let codec =
        SessionCheckpointJsonCodecV3::new(context).with_limits(SessionCheckpointLimits::default());

    let tip_json = codec.encode(&session)?;
    assert!(tip_json.contains("rootTextReplace"));
    assert!(tip_json.contains("https://left.test"));
    assert!(tip_json.contains("https://right.test"));
    let mut tip = codec.decode(&tip_json)?;
    assert_value(tip.state(), &result);
    assert_eq!((tip.undo_depth(), tip.redo_depth()), (1, 0));
    history_commit(tip.undo()?, "restored V3 clear undo")?;
    assert_value(tip.state(), &initial_value);
    assert_eq!((tip.undo_depth(), tip.redo_depth()), (0, 1));

    let redo_json = codec.encode(&tip)?;
    assert!(redo_json.contains("rootTextReplace"));
    let mut redo_branch = codec.decode(&redo_json)?;
    assert_value(redo_branch.state(), &initial_value);
    assert_eq!((redo_branch.undo_depth(), redo_branch.redo_depth()), (0, 1));
    history_commit(redo_branch.redo()?, "restored V3 clear redo")?;
    assert_value(redo_branch.state(), &result);
    assert_eq!((redo_branch.undo_depth(), redo_branch.redo_depth()), (1, 0));
    Ok(())
}
