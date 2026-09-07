//! Black-box replay and persistence contracts for property-free inline-format profiles.

use std::{
    error::Error,
    io,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use breditor_core::{
    action::{
        Action, ActionActivation, ActionEvaluation, ActionFault, ActionId, ActionInvocation,
        ActionPreparation, ActionRegistration, ActionRegistry, ActionStateSpec,
        builtins::ToggleInlineFormatAction,
    },
    codec::{
        DocumentJsonCodec, DocumentJsonCodecV2, SessionCheckpointCodecError,
        SessionCheckpointJsonCodec, SessionCheckpointJsonCodecV2, SessionCheckpointV2CodecError,
    },
    document::{Document, Format, FormatSet, PropertyMap, TextFragment, TextRun},
    extension::{
        ExtensionId, ExtensionLimits, ExtensionManifest, ExtensionSet, ExtensionVersion,
        InlineFormatSpecV1,
    },
    identity::QualifiedName,
    operation::{Operation, RootTextReplace, TextSplice},
    position::{Affinity, NodePath, Point, TextOffset},
    schema::{
        CompiledSchema, DocumentLimits, PersistedTypeRevision, SchemaBindingError, SchemaId,
        SchemaVersion,
    },
    selection::{RangeOrder, RangeSelection, ResolvedSelection, Selection},
    session::EditorSession,
    state::{EditorContext, EditorState, LineageId, Revision},
};
use serde_json::json;

type TestResult = Result<(), Box<dyn Error>>;

const FORMAT_KIND: &str = "example/highlight";
const PROFILE_NAME: &str = "example/replay-profile";

fn name(value: &str) -> Result<QualifiedName, Box<dyn Error>> {
    QualifiedName::try_new(value).map_err(Into::into)
}

fn path(indices: &[u32]) -> Result<NodePath, Box<dyn Error>> {
    NodePath::try_from_indices(indices.to_vec()).map_err(Into::into)
}

fn profile(format_revision: u32) -> Result<CompiledSchema, Box<dyn Error>> {
    let manifest = ExtensionManifest::try_new_with_inline_formats(
        ExtensionId::new(name("example/highlight-extension")?, ExtensionVersion::try_new(7)?),
        Vec::new(),
        Vec::new(),
        vec![InlineFormatSpecV1::new(
            name(FORMAT_KIND)?,
            PersistedTypeRevision::try_new(format_revision)?,
        )],
    )?;
    let extensions = ExtensionSet::try_new(vec![manifest], ExtensionLimits::default())?;
    CompiledSchema::try_compile_base_text_profile(
        SchemaId::new(name(PROFILE_NAME)?, SchemaVersion::try_new(1)?),
        &extensions,
    )
    .map_err(Into::into)
}

fn context(format_revision: u32) -> Result<EditorContext, Box<dyn Error>> {
    Ok(EditorContext::new(profile(format_revision)?, DocumentLimits::default()))
}

fn point(text_index: u32, offset: u32, affinity: Affinity) -> Result<Point, Box<dyn Error>> {
    text_point(0, text_index, offset, affinity)
}

fn text_point(
    paragraph_index: u32,
    text_index: u32,
    offset: u32,
    affinity: Affinity,
) -> Result<Point, Box<dyn Error>> {
    Ok(Point::Text {
        text_path: path(&[paragraph_index, text_index])?,
        utf16_offset: offset,
        affinity,
    })
}

fn selected(anchor: Point, focus: Point) -> Selection {
    RangeSelection::new(anchor, focus).into()
}

fn collapsed(point: Point) -> Selection {
    selected(point.clone(), point)
}

fn profile_document_json_with_paragraphs(
    schema: &CompiledSchema,
    paragraph_texts: &[&str],
) -> String {
    let paragraphs = paragraph_texts
        .iter()
        .map(|text| {
            let children = if text.is_empty() {
                Vec::new()
            } else {
                vec![json!({
                    "kind": "text",
                    "text": text,
                    "formats": [],
                })]
            };
            json!({
                "kind": "element",
                "type": "breditor/paragraph",
                "entityId": null,
                "properties": {},
                "children": children,
            })
        })
        .collect::<Vec<_>>();
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
    lineage: &str,
    text: &str,
    selection: Selection,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    state_with_paragraphs(context, lineage, &[text], selection, pending_formats)
}

fn state_with_paragraphs(
    context: &EditorContext,
    lineage: &str,
    paragraph_texts: &[&str],
    selection: Selection,
    pending_formats: Option<FormatSet>,
) -> Result<EditorState, Box<dyn Error>> {
    let document = DocumentJsonCodecV2::new(context.schema().clone())
        .with_limits(context.limits().clone())
        .decode(&profile_document_json_with_paragraphs(context.schema(), paragraph_texts))?;
    EditorState::try_new(
        context,
        LineageId::try_new(lineage)?,
        document,
        Some(selection),
        pending_formats,
    )
    .map_err(Into::into)
}

fn format_set(formatted: bool) -> Result<FormatSet, Box<dyn Error>> {
    if !formatted {
        return Ok(FormatSet::default());
    }
    FormatSet::try_from_formats(vec![Format::new(name(FORMAT_KIND)?, PropertyMap::default())])
        .map_err(Into::into)
}

fn fragment(text: &str, formatted: bool) -> Result<TextFragment, Box<dyn Error>> {
    TextRun::try_new(text, format_set(formatted)?).map(TextFragment::from).map_err(Into::into)
}

fn only_splice(operations: &[Operation]) -> Result<&TextSplice, Box<dyn Error>> {
    let [Operation::TextSplice(splice)] = operations else {
        return Err(io::Error::other(format!(
            "expected exactly one text splice, got {operations:?}"
        ))
        .into());
    };
    Ok(splice)
}

fn only_root_replace(operations: &[Operation]) -> Result<&RootTextReplace, Box<dyn Error>> {
    let [Operation::RootTextReplace(replace)] = operations else {
        return Err(io::Error::other(format!(
            "expected exactly one root text replace, got {operations:?}"
        ))
        .into());
    };
    Ok(replace)
}

fn assert_paragraph_runs(document: &Document, expected: &[(&str, bool)]) -> TestResult {
    assert_paragraph_runs_at(document, 0, expected)
}

fn assert_paragraph_runs_at(
    document: &Document,
    paragraph_index: usize,
    expected: &[(&str, bool)],
) -> TestResult {
    let paragraph = document
        .root()
        .as_element()
        .and_then(|root| root.children().get(paragraph_index))
        .and_then(breditor_core::document::NodeRef::as_element)
        .ok_or_else(|| {
            io::Error::other(format!("profile document lost paragraph {paragraph_index}"))
        })?;
    assert_eq!(paragraph.children().len(), expected.len());
    for (child, (expected_text, expected_formatted)) in paragraph.children().iter().zip(expected) {
        let text = child
            .as_text()
            .ok_or_else(|| io::Error::other("profile paragraph child was not text"))?;
        assert_eq!(text.text(), *expected_text);
        assert_eq!(text.formats(), &format_set(*expected_formatted)?);
    }
    Ok(())
}

fn assert_selection(state: &EditorState, anchor: &Point, focus: &Point) -> TestResult {
    let Some(Selection::Range(range)) = state.selection() else {
        return Err(io::Error::other("state lost its range selection").into());
    };
    assert_eq!(range.anchor(), anchor);
    assert_eq!(range.focus(), focus);
    Ok(())
}

fn assert_backward_selection(state: &EditorState, anchor: &Point, focus: &Point) -> TestResult {
    assert_selection(state, anchor, focus)?;
    let selection =
        state.selection().ok_or_else(|| io::Error::other("state lost its backward selection"))?;
    let ResolvedSelection::Range(resolved) =
        selection.resolve(state.context().schema(), state.document())?;
    assert_eq!(resolved.order(), RangeOrder::Backward);
    Ok(())
}

#[derive(Clone)]
struct CountingToggle {
    evaluations: Arc<AtomicUsize>,
    inner: ToggleInlineFormatAction,
}

impl Action for CountingToggle {
    type Input = ();

    fn state_spec() -> ActionStateSpec {
        <ToggleInlineFormatAction as Action>::state_spec()
    }

    fn evaluate(
        &self,
        state: &EditorState,
        input: &Self::Input,
    ) -> Result<ActionEvaluation, ActionFault> {
        self.evaluations.fetch_add(1, Ordering::SeqCst);
        self.inner.evaluate(state, input)
    }
}

fn counting_registry(
    evaluations: Arc<AtomicUsize>,
) -> Result<(ActionRegistry, ActionId), Box<dyn Error>> {
    let id = ActionId::try_new("example/toggle-highlight")?;
    let action =
        CountingToggle { evaluations, inner: ToggleInlineFormatAction::new(name(FORMAT_KIND)?) };
    let registry = ActionRegistry::try_new(vec![ActionRegistration::new(id.clone(), action)])?;
    Ok((registry, id))
}

#[test]
#[allow(clippy::too_many_lines)]
fn generic_toggle_stores_exact_primitive_replay_across_history_and_v2_checkpoint() -> TestResult {
    let source_context = context(1)?;
    assert_ne!(source_context.schema().id().name().as_str(), "breditor/base");
    let initial_anchor = point(0, 1, Affinity::Before)?;
    let initial_focus = point(0, 5, Affinity::After)?;
    let initial_selection = selected(initial_anchor.clone(), initial_focus.clone());
    let initial = state(
        &source_context,
        "inline-format-profile-replay",
        "abcdef",
        initial_selection.clone(),
        None,
    )?;

    let evaluations = Arc::new(AtomicUsize::new(0));
    let (registry, action_id) = counting_registry(evaluations.clone())?;
    let preparation =
        registry.prepare(&initial, &ActionInvocation::without_input(action_id.clone()))?;
    let ActionPreparation::Enabled(prepared) = &preparation else {
        return Err(io::Error::other("custom format toggle was unexpectedly disabled").into());
    };
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
    assert_eq!(prepared.transaction().operations().len(), 1);
    let planned = only_splice(prepared.transaction().operations())?.clone();
    assert_eq!(planned.range().container_path(), &path(&[0])?);
    assert_eq!(planned.range().start(), TextOffset::try_new(1)?);
    assert_eq!(planned.range().end(), TextOffset::try_new(5)?);
    assert_eq!(planned.expected_removed(), &fragment("bcde", false)?);
    assert_eq!(planned.replacement(), &fragment("bcde", true)?);

    let mut session = EditorSession::new(initial.clone());
    let commit = session.execute_prepared_action(preparation)?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(commit.metadata().action(), Some(action_id.qualified_name()));
    assert_eq!(commit.revision(), Revision::new(1));
    assert_eq!(session.undo_depth(), 1);
    assert_eq!(session.redo_depth(), 0);
    assert_eq!(commit.before(), &initial);
    assert_eq!(commit.after().pending_formats(), None);
    assert_paragraph_runs(
        commit.after().document(),
        &[("a", false), ("bcde", true), ("f", false)],
    )?;

    let result_anchor = point(1, 0, Affinity::Before)?;
    let result_focus = point(2, 0, Affinity::After)?;
    assert_selection(commit.after(), &result_anchor, &result_focus)?;
    let forward = only_splice(commit.forward_operations())?;
    assert_eq!(forward, &planned);
    let inverse = only_splice(commit.inverse_operations())?;
    assert_eq!(inverse.range().container_path(), &path(&[0])?);
    assert_eq!(inverse.range().start(), TextOffset::try_new(1)?);
    assert_eq!(inverse.range().end(), TextOffset::try_new(5)?);
    assert_eq!(inverse.expected_removed(), &fragment("bcde", true)?);
    assert_eq!(inverse.replacement(), &fragment("bcde", false)?);

    let undo =
        session.undo()?.ok_or_else(|| io::Error::other("custom format undo was unavailable"))?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(undo.forward_operations(), commit.inverse_operations());
    assert_eq!(session.state().document(), initial.document());
    assert_eq!(session.state().selection(), Some(&initial_selection));
    assert_eq!(session.state().pending_formats(), None);

    let redo =
        session.redo()?.ok_or_else(|| io::Error::other("custom format redo was unavailable"))?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(redo.forward_operations(), commit.forward_operations());
    assert_eq!(session.state().document(), commit.after().document());
    assert_eq!(session.state().selection(), commit.after().selection());
    assert_eq!(session.state().pending_formats(), commit.after().pending_formats());

    let encoded = SessionCheckpointJsonCodecV2::new(source_context.clone()).encode(&session)?;
    let independent_context = context(1)?;
    assert_eq!(source_context.schema(), independent_context.schema());
    assert_ne!(source_context, independent_context);
    let mut restored =
        SessionCheckpointJsonCodecV2::new(independent_context.clone()).decode(&encoded)?;
    assert_eq!(restored.undo_depth(), 1);
    assert_eq!(restored.redo_depth(), 0);
    assert_eq!(restored.state().document(), session.state().document());
    assert_eq!(restored.state().selection(), session.state().selection());
    assert_eq!(restored.state().pending_formats(), session.state().pending_formats());

    let restored_undo = restored
        .undo()?
        .ok_or_else(|| io::Error::other("restored custom format undo was unavailable"))?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(restored_undo.forward_operations(), commit.inverse_operations());
    assert_eq!(restored.state().document(), initial.document());
    assert_eq!(restored.state().selection(), Some(&initial_selection));
    assert_eq!(restored.state().pending_formats(), None);

    let restored_redo = restored
        .redo()?
        .ok_or_else(|| io::Error::other("restored custom format redo was unavailable"))?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(restored_redo.forward_operations(), commit.forward_operations());
    assert_eq!(restored.state().document(), commit.after().document());
    assert_eq!(restored.state().selection(), commit.after().selection());
    assert_eq!(restored.state().pending_formats(), None);

    let mismatched_context = context(2)?;
    let Err(SessionCheckpointV2CodecError::SchemaBinding(
        SchemaBindingError::SchemaFingerprintMismatch { expected, found },
    )) = SessionCheckpointJsonCodecV2::new(mismatched_context.clone()).decode(&encoded)
    else {
        return Err(
            io::Error::other("changed format meaning did not reject the V2 checkpoint").into()
        );
    };
    assert_eq!(expected, mismatched_context.schema().fingerprint());
    assert_eq!(found, source_context.schema().fingerprint());

    assert!(matches!(
        SessionCheckpointJsonCodec::new(source_context.clone()).encode(&session),
        Err(SessionCheckpointCodecError::ContextConfigurationMismatch)
    ));
    assert!(matches!(
        DocumentJsonCodec::new(source_context.schema().clone()).encode(initial.document()),
        Err(breditor_core::codec::DocumentCodecError::SchemaMismatch { .. })
    ));
    Ok(())
}

#[test]
#[allow(clippy::too_many_lines)]
fn cross_paragraph_custom_toggle_root_replace_survives_v2_checkpoint_without_reevaluation()
-> TestResult {
    let source_context = context(1)?;
    let initial_anchor = text_point(2, 0, 1, Affinity::After)?;
    let initial_focus = text_point(0, 0, 1, Affinity::Before)?;
    let initial_selection = selected(initial_anchor.clone(), initial_focus.clone());
    let initial = state_with_paragraphs(
        &source_context,
        "inline-format-profile-cross-replay",
        &["ab", "", "cd"],
        initial_selection.clone(),
        None,
    )?;
    assert_backward_selection(&initial, &initial_anchor, &initial_focus)?;
    assert_eq!(initial.pending_formats(), None);

    let evaluations = Arc::new(AtomicUsize::new(0));
    let (registry, action_id) = counting_registry(evaluations.clone())?;
    let preparation =
        registry.prepare(&initial, &ActionInvocation::without_input(action_id.clone()))?;
    let ActionPreparation::Enabled(prepared) = &preparation else {
        return Err(io::Error::other("cross-paragraph custom format toggle was disabled").into());
    };
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(prepared.indicator().activation(), ActionActivation::Inactive);
    let planned = only_root_replace(prepared.transaction().operations())?.clone();
    assert_eq!(planned.range().start().paragraph_index(), 0);
    assert_eq!(planned.range().start().offset(), TextOffset::try_new(1)?);
    assert_eq!(planned.range().end().paragraph_index(), 2);
    assert_eq!(planned.range().end().offset(), TextOffset::try_new(1)?);
    let expected_paragraphs =
        vec![fragment("ab", false)?, TextFragment::empty(), fragment("cd", false)?];
    assert_eq!(planned.expected_paragraphs(), expected_paragraphs);
    let replacement_paragraphs =
        vec![fragment("b", true)?, TextFragment::empty(), fragment("c", true)?];
    assert_eq!(planned.replacement_paragraphs(), replacement_paragraphs);

    let mut session = EditorSession::new(initial.clone());
    let commit = session.execute_prepared_action(preparation)?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(commit.metadata().action(), Some(action_id.qualified_name()));
    assert_eq!(commit.revision(), Revision::new(1));
    assert_eq!(only_root_replace(commit.forward_operations())?, &planned);
    only_root_replace(commit.inverse_operations())?;
    assert_paragraph_runs_at(commit.after().document(), 0, &[("a", false), ("b", true)])?;
    assert_paragraph_runs_at(commit.after().document(), 1, &[])?;
    assert_paragraph_runs_at(commit.after().document(), 2, &[("c", true), ("d", false)])?;
    let result_anchor = text_point(2, 1, 0, Affinity::After)?;
    let result_focus = text_point(0, 1, 0, Affinity::Before)?;
    assert_backward_selection(commit.after(), &result_anchor, &result_focus)?;
    assert_eq!(commit.after().pending_formats(), None);

    let undo = session
        .undo()?
        .ok_or_else(|| io::Error::other("cross-paragraph custom format undo was unavailable"))?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(undo.forward_operations(), commit.inverse_operations());
    only_root_replace(undo.forward_operations())?;
    assert_eq!(session.state().document(), initial.document());
    assert_backward_selection(session.state(), &initial_anchor, &initial_focus)?;
    assert_eq!(session.state().selection(), Some(&initial_selection));
    assert_eq!(session.state().pending_formats(), None);

    let redo = session
        .redo()?
        .ok_or_else(|| io::Error::other("cross-paragraph custom format redo was unavailable"))?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(redo.forward_operations(), commit.forward_operations());
    only_root_replace(redo.forward_operations())?;
    assert_eq!(session.state().document(), commit.after().document());
    assert_backward_selection(session.state(), &result_anchor, &result_focus)?;
    assert_eq!(session.state().pending_formats(), None);

    let encoded = SessionCheckpointJsonCodecV2::new(source_context.clone()).encode(&session)?;
    let independent_context = context(1)?;
    assert_eq!(source_context.schema(), independent_context.schema());
    assert_ne!(source_context, independent_context);
    let mut restored = SessionCheckpointJsonCodecV2::new(independent_context).decode(&encoded)?;
    assert_eq!((restored.undo_depth(), restored.redo_depth()), (1, 0));
    assert_eq!(restored.state().document(), commit.after().document());
    assert_backward_selection(restored.state(), &result_anchor, &result_focus)?;
    assert_eq!(restored.state().pending_formats(), None);

    let restored_undo = restored.undo()?.ok_or_else(|| {
        io::Error::other("restored cross-paragraph custom format undo was unavailable")
    })?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(restored_undo.forward_operations(), commit.inverse_operations());
    only_root_replace(restored_undo.forward_operations())?;
    assert_eq!(restored.state().document(), initial.document());
    assert_backward_selection(restored.state(), &initial_anchor, &initial_focus)?;
    assert_eq!(restored.state().selection(), Some(&initial_selection));
    assert_eq!(restored.state().pending_formats(), None);

    let restored_redo = restored.redo()?.ok_or_else(|| {
        io::Error::other("restored cross-paragraph custom format redo was unavailable")
    })?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert_eq!(restored_redo.forward_operations(), commit.forward_operations());
    only_root_replace(restored_redo.forward_operations())?;
    assert_eq!(restored.state().document(), commit.after().document());
    assert_backward_selection(restored.state(), &result_anchor, &result_focus)?;
    assert_eq!(restored.state().pending_formats(), None);
    Ok(())
}

#[test]
fn collapsed_generic_toggle_preserves_content_and_selection_and_sets_explicit_pending_formats()
-> TestResult {
    let context = context(1)?;
    let caret = point(0, 2, Affinity::After)?;
    let selection = collapsed(caret.clone());
    let initial = state(&context, "inline-format-profile-pending", "abc", selection.clone(), None)?;
    let evaluations = Arc::new(AtomicUsize::new(0));
    let (registry, action_id) = counting_registry(evaluations.clone())?;
    let mut session = EditorSession::new(initial.clone());

    let add =
        registry.prepare(session.state(), &ActionInvocation::without_input(action_id.clone()))?;
    let ActionPreparation::Enabled(add_prepared) = &add else {
        return Err(io::Error::other("collapsed custom format toggle was disabled").into());
    };
    assert!(add_prepared.transaction().operations().is_empty());
    assert_eq!(add_prepared.indicator().activation(), ActionActivation::Inactive);
    let add_commit = session.execute_prepared_action(add)?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 1);
    assert!(add_commit.forward_operations().is_empty());
    assert!(add_commit.inverse_operations().is_empty());
    assert_eq!(session.state().document(), initial.document());
    assert_eq!(session.state().selection(), Some(&selection));
    assert_eq!(session.state().pending_formats(), Some(&format_set(true)?));
    assert_eq!(session.state().snapshot().revision(), Revision::new(1));
    assert_eq!(session.undo_depth(), 0);
    assert_eq!(session.redo_depth(), 0);

    let remove = registry.prepare(session.state(), &ActionInvocation::without_input(action_id))?;
    let ActionPreparation::Enabled(remove_prepared) = &remove else {
        return Err(io::Error::other("explicit pending custom format toggle was disabled").into());
    };
    assert!(remove_prepared.transaction().operations().is_empty());
    assert_eq!(remove_prepared.indicator().activation(), ActionActivation::Active);
    let remove_commit = session.execute_prepared_action(remove)?;
    assert_eq!(evaluations.load(Ordering::SeqCst), 2);
    assert!(remove_commit.forward_operations().is_empty());
    assert!(remove_commit.inverse_operations().is_empty());
    assert_eq!(session.state().document(), initial.document());
    assert_eq!(session.state().selection(), Some(&selection));
    assert_eq!(session.state().pending_formats(), Some(&FormatSet::default()));
    assert_eq!(session.state().snapshot().revision(), Revision::new(2));
    assert_eq!(session.undo_depth(), 0);
    assert_eq!(session.redo_depth(), 0);
    Ok(())
}
