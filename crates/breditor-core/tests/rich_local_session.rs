#![cfg(feature = "experimental-rich-content")]
//! Functional rich text/format editing and exact owner-held selection/history workflows.

use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CellId, ColumnId, ImageId, ImageSize, RichDocument, RichLocalOutcome,
        RichLocalSession, RichLocalSessionError, RichSelection, RichSelectionKind,
        RichSelectionUpdate, RichTextPoint, RowId, TableId,
        actions::{
            DeleteText, InsertText, ReplaceText, ResizeImage, RichAction, RichFormatChange,
            SetHeading, SetInlineFormat, SetTableHeader, apply_batch,
        },
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn context() -> Result<EditorContext, Box<dyn std::error::Error>> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/rich-local")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn original(context: &EditorContext) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let value = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":context.schema().id().name().as_str(),"version":1},
        "schemaFingerprint":context.schema().fingerprint().to_string(),
        "root":serde_json::from_str::<Value>(include_str!("fixtures/rich-local-root.json"))?});
    let codec = DocumentJsonCodecV2::new(context.schema().clone());
    Ok(RichDocument::try_admit(
        context.schema(),
        codec.decode(&value.to_string())?,
        context.limits(),
    )?)
}
fn fragment(text: &str) -> Result<TextFragment, Box<dyn std::error::Error>> {
    if text.is_empty() {
        return Ok(TextFragment::empty());
    }
    Ok(TextRun::try_new(text, FormatSet::default())?.into())
}
fn point(
    id: &str,
    offset: u64,
    affinity: Affinity,
) -> Result<RichTextPoint, Box<dyn std::error::Error>> {
    Ok(RichTextPoint::new(BlockId::try_new(id)?, TextOffset::try_new(offset)?, affinity))
}
fn caret(
    id: &str,
    offset: u64,
    affinity: Affinity,
) -> Result<RichSelectionKind, Box<dyn std::error::Error>> {
    let point = point(id, offset, affinity)?;
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
fn offset(selection: &RichSelection) -> Result<(u64, u64), Box<dyn std::error::Error>> {
    let RichSelectionKind::TextRange { anchor, focus } = selection.kind() else {
        return Err("text selection".into());
    };
    Ok((anchor.offset().get(), focus.offset().get()))
}
fn content(
    context: &EditorContext,
    document: &RichDocument,
    block: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let node = document
        .document()
        .node_at(document.block_path(&BlockId::try_new(block)?).ok_or("block")?)?
        .as_element()
        .ok_or("element")?;
    let _ = context;
    Ok(node
        .children()
        .iter()
        .filter_map(breditor_core::document::NodeRef::as_text)
        .map(breditor_core::document::TextNode::text)
        .collect())
}
fn bytes(
    context: &EditorContext,
    document: &RichDocument,
) -> Result<String, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(context.schema().clone()).encode(document.document())?)
}
fn assert_inverse(
    context: &EditorContext,
    original: &RichDocument,
    action: &RichAction,
) -> TestResult {
    let edit = action.apply(context, original)?.ok_or("edit")?;
    let restored = edit.inverse().apply(context, edit.document())?.ok_or("undo")?;
    assert_eq!(bytes(context, restored.document())?, bytes(context, original)?);
    let redone = restored.inverse().apply(context, restored.document())?.ok_or("redo")?;
    assert_eq!(bytes(context, redone.document())?, bytes(context, edit.document())?);
    Ok(())
}

#[test]
fn insertion_in_a_cell_preserves_formats_and_maps_boundary_affinity() -> TestResult {
    let context = context()?;
    let original = original(&context)?;
    let action = RichAction::InsertText(InsertText::capture(
        &original,
        &point("p", 1, Affinity::After)?,
        &fragment("X")?,
    )?);
    let edit = action.apply(&context, &original)?.ok_or("edit")?;
    assert_eq!(content(&context, edit.document(), "p")?, "aX🙂b");
    for (affinity, expected) in [(Affinity::Before, 1), (Affinity::After, 2)] {
        let selection = RichSelection::try_new(&original, caret("p", 1, affinity)?)?;
        let mapped = edit.map_selection(&selection)?;
        assert_eq!(offset(mapped.selection().ok_or("mapped")?)?, (expected, expected));
    }
    let value: Value = serde_json::from_str(&bytes(&context, edit.document())?)?;
    let runs =
        &value["root"]["children"][0]["children"][0]["children"][0]["children"][0]["children"];
    assert_eq!(runs.as_array().ok_or("runs")?.len(), 3);
    assert_eq!(runs[0]["formats"][0]["type"], "breditor/strong");
    assert_eq!(runs[1]["formats"], json!([]));
    assert_eq!(runs[2]["text"], "🙂b");
    assert_inverse(&context, &original, &action)
}

#[test]
fn deletion_and_replacement_keep_unicode_exact_and_directional_points() -> TestResult {
    let context = context()?;
    let original = original(&context)?;
    let block = BlockId::try_new("p")?;
    let selected = RichSelection::try_new(
        &original,
        RichSelectionKind::TextRange {
            anchor: point("p", 3, Affinity::After)?,
            focus: point("p", 1, Affinity::Before)?,
        },
    )?;
    let delete = RichAction::DeleteText(DeleteText::capture(
        &original,
        &block,
        TextOffset::try_new(1)?,
        TextOffset::try_new(3)?,
    )?);
    let edit = delete.apply(&context, &original)?.ok_or("delete")?;
    assert_eq!(content(&context, edit.document(), "p")?, "ab");
    assert_eq!(offset(edit.map_selection(&selected)?.selection().ok_or("map")?)?, (1, 1));
    assert_inverse(&context, &original, &delete)?;
    let replace = RichAction::ReplaceText(ReplaceText::capture(
        &original,
        &block,
        TextOffset::try_new(1)?,
        TextOffset::try_new(3)?,
        &fragment("e\u{301}")?,
    )?);
    let edit = replace.apply(&context, &original)?.ok_or("replace")?;
    assert_eq!(content(&context, edit.document(), "p")?, "ae\u{301}b");
    assert_eq!(offset(edit.map_selection(&selected)?.selection().ok_or("map")?)?, (3, 1));
    assert_inverse(&context, &original, &replace)
}

#[test]
fn caption_typing_uses_the_same_text_owner_and_retains_image_binding() -> TestResult {
    let context = context()?;
    let original = original(&context)?;
    let action = RichAction::InsertText(InsertText::capture(
        &original,
        &point("caption", 2, Affinity::After)?,
        &fragment(" e\u{301}")?,
    )?);
    let edit = action.apply(&context, &original)?.ok_or("edit")?;
    assert_eq!(content(&context, edit.document(), "caption")?, "xy e\u{301}🙂");
    assert_eq!(
        edit.document().image(&ImageId::try_new("image")?)?,
        original.image(&ImageId::try_new("image")?)?
    );
    assert_inverse(&context, &original, &action)
}

#[test]
fn formatting_resegments_canonical_runs_without_changing_stable_text_offsets() -> TestResult {
    let context = context()?;
    let original = original(&context)?;
    let selected = RichSelection::try_new(&original, caret("p", 3, Affinity::After)?)?;
    let kind = QualifiedName::try_new("breditor/strong")?;
    let action = RichAction::SetInlineFormat(SetInlineFormat::capture(
        &original,
        &BlockId::try_new("p")?,
        TextOffset::try_new(1)?,
        TextOffset::try_new(3)?,
        &RichFormatChange::Remove(kind.clone()),
    )?);
    let edit = action.apply(&context, &original)?.ok_or("format")?;
    assert_eq!(content(&context, edit.document(), "p")?, "a🙂b");
    assert_eq!(offset(edit.map_selection(&selected)?.selection().ok_or("map")?)?, (3, 3));
    assert_inverse(&context, &original, &action)?;
    let restored_format = SetInlineFormat::capture(
        edit.document(),
        &BlockId::try_new("p")?,
        TextOffset::try_new(1)?,
        TextOffset::try_new(3)?,
        &RichFormatChange::Set(Format::new(kind, PropertyMap::default())),
    )?
    .apply(&context, edit.document())?
    .ok_or("format")?;
    assert_eq!(bytes(&context, restored_format.document())?, bytes(&context, &original)?);
    Ok(())
}

#[test]
fn grouped_text_maps_follow_each_real_splice_without_losing_the_final_snapshot_proof() -> TestResult
{
    let context = context()?;
    let original = original(&context)?;
    let selected = RichSelection::try_new(&original, caret("p", 3, Affinity::After)?)?;
    let first = RichAction::InsertText(InsertText::capture(
        &original,
        &point("p", 1, Affinity::After)?,
        &fragment("X")?,
    )?);
    let staged = first.apply(&context, &original)?.ok_or("stage")?;
    let second = RichAction::DeleteText(DeleteText::capture(
        staged.document(),
        &BlockId::try_new("p")?,
        TextOffset::try_new(2)?,
        TextOffset::try_new(4)?,
    )?);
    let group = apply_batch(&context, &original, &[first, second])?.ok_or("group")?;
    assert_eq!(content(&context, group.document(), "p")?, "aXb");
    assert_eq!(offset(group.map_selection(&selected)?.selection().ok_or("map")?)?, (2, 2));
    let undo = apply_batch(&context, group.document(), group.inverse())?.ok_or("undo")?;
    assert_eq!(bytes(&context, undo.document())?, bytes(&context, &original)?);
    Ok(())
}

#[test]
fn runtime_owner_restores_saved_carets_even_after_the_user_moves_selection() -> TestResult {
    let context = context()?;
    let original = original(&context)?;
    let baseline = bytes(&context, &original)?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        original,
        Some(caret("p", 1, Affinity::After)?),
        HistoryCapacity::default(),
    )?;
    let action = RichAction::InsertText(InsertText::capture(
        owner.state().document(),
        &point("p", 1, Affinity::After)?,
        &fragment("X")?,
    )?);
    assert_eq!(
        owner.dispatch(&owner.snapshot(), &[action], RichSelectionUpdate::Map)?,
        RichLocalOutcome::ContentCommitted
    );
    let changed = bytes(&context, owner.state().document())?;
    assert_eq!(offset(owner.state().selection().ok_or("selection")?)?, (2, 2));
    assert_eq!(
        owner.set_selection(&owner.snapshot(), Some(caret("p", 4, Affinity::After)?))?,
        RichLocalOutcome::SelectionOnly
    );
    assert_eq!(owner.undo(&owner.snapshot())?, RichLocalOutcome::UndoApplied);
    assert_eq!(bytes(&context, owner.state().document())?, baseline);
    assert_eq!(offset(owner.state().selection().ok_or("selection")?)?, (1, 1));
    assert_eq!(owner.redo(&owner.snapshot())?, RichLocalOutcome::RedoApplied);
    assert_eq!(bytes(&context, owner.state().document())?, changed);
    assert_eq!(offset(owner.state().selection().ok_or("selection")?)?, (2, 2));
    assert_eq!(owner.state().revision().get(), 4);
    Ok(())
}

#[test]
fn heading_conversion_in_cells_retains_text_formats_and_text_node_selections() -> TestResult {
    let context = context()?;
    let original = original(&context)?;
    let block = BlockId::try_new("p")?;
    let action = RichAction::SetHeading(SetHeading::capture(&original, &block, Some(2))?);
    let edit = action.apply(&context, &original)?.ok_or("heading")?;
    assert_eq!(content(&context, edit.document(), "p")?, "a🙂b");
    for kind in [caret("p", 3, Affinity::After)?, RichSelectionKind::Node(block)] {
        let selected = RichSelection::try_new(&original, kind.clone())?;
        assert_eq!(edit.map_selection(&selected)?.selection().ok_or("map")?.kind(), &kind);
    }
    assert_inverse(&context, &original, &action)?;
    let invalid_caption = SetHeading::capture(&original, &BlockId::try_new("caption")?, Some(2))?;
    assert!(invalid_caption.apply(&context, &original).is_err());
    Ok(())
}

fn type_at(owner: &mut RichLocalSession, offset: u64, text: &str) -> TestResult {
    let action = RichAction::InsertText(InsertText::capture(
        owner.state().document(),
        &point("p", offset, Affinity::After)?,
        &fragment(text)?,
    )?);
    owner.dispatch(&owner.snapshot(), &[action], RichSelectionUpdate::Map)?;
    Ok(())
}

#[test]
fn selection_only_and_no_op_dispatches_preserve_redo_while_new_typing_branches_history()
-> TestResult {
    let context = context()?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        original(&context)?,
        None,
        HistoryCapacity::default(),
    )?;
    type_at(&mut owner, 1, "X")?;
    type_at(&mut owner, 2, "Y")?;
    owner.undo(&owner.snapshot())?;
    assert_eq!((owner.undo_depth(), owner.redo_depth()), (1, 1));
    owner.set_selection(&owner.snapshot(), Some(caret("p", 1, Affinity::Before)?))?;
    let observed = owner.snapshot();
    let no_op = RichAction::InsertText(InsertText::capture(
        owner.state().document(),
        &point("p", 0, Affinity::After)?,
        &fragment("")?,
    )?);
    assert_eq!(
        owner.dispatch(&observed, &[no_op], RichSelectionUpdate::Map)?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!((owner.undo_depth(), owner.redo_depth()), (1, 1));
    assert_eq!(
        owner.dispatch(&observed, &[], RichSelectionUpdate::Map)?,
        RichLocalOutcome::Unchanged
    );
    type_at(&mut owner, 2, "Z")?;
    assert_eq!((owner.undo_depth(), owner.redo_depth()), (2, 0));
    assert_eq!(content(&context, owner.state().document(), "p")?, "aXZ🙂b");
    Ok(())
}

#[test]
fn bounded_history_evicts_old_entries_and_disabled_history_still_publishes_content() -> TestResult {
    let context = context()?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        original(&context)?,
        None,
        HistoryCapacity::try_new(1)?,
    )?;
    type_at(&mut owner, 1, "X")?;
    type_at(&mut owner, 2, "Y")?;
    assert_eq!(owner.undo_depth(), 1);
    owner.undo(&owner.snapshot())?;
    assert_eq!(content(&context, owner.state().document(), "p")?, "aX🙂b");
    assert_eq!(owner.undo(&owner.snapshot())?, RichLocalOutcome::Unchanged);
    let mut disabled = RichLocalSession::try_new(
        context.clone(),
        original(&context)?,
        None,
        HistoryCapacity::DISABLED,
    )?;
    type_at(&mut disabled, 1, "X")?;
    assert_eq!(disabled.undo_depth(), 0);
    assert_eq!(content(&context, disabled.state().document(), "p")?, "aX🙂b");
    Ok(())
}

#[test]
fn stale_and_foreign_owner_observations_cannot_publish_even_no_op_work() -> TestResult {
    let context = context()?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        original(&context)?,
        None,
        HistoryCapacity::default(),
    )?;
    let old = owner.snapshot();
    owner.set_selection(&old, Some(caret("p", 1, Affinity::After)?))?;
    assert!(matches!(
        owner.dispatch(&old, &[], RichSelectionUpdate::Map),
        Err(RichLocalSessionError::StaleSnapshot)
    ));
    let other = RichLocalSession::try_new(
        context.clone(),
        original(&context)?,
        None,
        HistoryCapacity::default(),
    )?;
    assert!(matches!(owner.undo(&other.snapshot()), Err(RichLocalSessionError::StaleSnapshot)));
    assert_eq!(owner.undo_depth(), 0);
    Ok(())
}

#[test]
fn failed_late_action_or_final_selection_preserves_content_revision_and_history() -> TestResult {
    let context = context()?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        original(&context)?,
        Some(caret("p", 1, Affinity::After)?),
        HistoryCapacity::default(),
    )?;
    let observed = owner.snapshot();
    let baseline = bytes(&context, owner.state().document())?;
    let first = RichAction::InsertText(InsertText::capture(
        owner.state().document(),
        &point("p", 1, Affinity::After)?,
        &fragment("X")?,
    )?);
    let stale = RichAction::DeleteText(DeleteText::capture(
        owner.state().document(),
        &BlockId::try_new("p")?,
        TextOffset::ZERO,
        TextOffset::try_new(1)?,
    )?);
    assert!(owner.dispatch(&observed, &[first.clone(), stale], RichSelectionUpdate::Map).is_err());
    assert!(
        owner
            .dispatch(
                &observed,
                &[first],
                RichSelectionUpdate::Set(Some(caret("missing", 0, Affinity::After)?))
            )
            .is_err()
    );
    assert_eq!(bytes(&context, owner.state().document())?, baseline);
    assert_eq!(owner.state().revision().get(), 0);
    assert_eq!((owner.undo_depth(), owner.redo_depth()), (0, 0));
    assert_eq!(
        owner.dispatch(&observed, &[], RichSelectionUpdate::Map)?,
        RichLocalOutcome::Unchanged
    );
    Ok(())
}

#[test]
fn one_mixed_rich_dispatch_owns_cell_caption_header_resize_and_exact_selection_history()
-> TestResult {
    let context = context()?;
    let original = original(&context)?;
    let cell = CellId::new(TableId::try_new("t")?, RowId::try_new("r")?, ColumnId::try_new("c")?);
    let grid = RichSelectionKind::Grid { anchor: cell.clone(), focus: cell };
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        original.clone(),
        Some(grid.clone()),
        HistoryCapacity::default(),
    )?;
    let mut staged = original.clone();
    let first = RichAction::InsertText(InsertText::capture(
        &staged,
        &point("p", 1, Affinity::After)?,
        &fragment("X")?,
    )?);
    staged = first.apply(&context, &staged)?.ok_or("stage")?.into_parts().0;
    let second = RichAction::ReplaceText(ReplaceText::capture(
        &staged,
        &BlockId::try_new("caption")?,
        TextOffset::ZERO,
        TextOffset::try_new(4)?,
        &fragment("new 🙂")?,
    )?);
    staged = second.apply(&context, &staged)?.ok_or("stage")?.into_parts().0;
    let third = RichAction::SetTableHeader(SetTableHeader::capture(
        &staged,
        &RichSelection::try_new(&staged, grid.clone())?,
        true,
    )?);
    staged = third.apply(&context, &staged)?.ok_or("stage")?.into_parts().0;
    let fourth = RichAction::ResizeImage(ResizeImage::capture(
        &staged,
        &ImageId::try_new("image")?,
        Some(ImageSize::try_new(320, 240)?),
    )?);
    let after_selection = caret("caption", 6, Affinity::After)?;
    owner.dispatch(
        &owner.snapshot(),
        &[first, second, third, fourth],
        RichSelectionUpdate::Set(Some(after_selection.clone())),
    )?;
    assert_eq!(owner.undo_depth(), 1);
    assert_eq!(content(&context, owner.state().document(), "caption")?, "new 🙂");
    let changed = bytes(&context, owner.state().document())?;
    owner.undo(&owner.snapshot())?;
    assert_eq!(bytes(&context, owner.state().document())?, bytes(&context, &original)?);
    assert_eq!(owner.state().selection().ok_or("grid")?.kind(), &grid);
    owner.redo(&owner.snapshot())?;
    assert_eq!(bytes(&context, owner.state().document())?, changed);
    assert_eq!(owner.state().selection().ok_or("text")?.kind(), &after_selection);
    Ok(())
}
