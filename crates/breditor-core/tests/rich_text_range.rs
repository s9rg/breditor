#![cfg(feature = "experimental-rich-content")]
//! Atomic rich range typing/paste/deletion, precise suffix maps and exact recovered history.

use breditor_core::{
    block::OrderedListStart,
    codec::{DocumentJsonCodecV2, RichSessionJsonCodec},
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        AssetGeneration, AssetId, BlockId, ImageAlt, ImageBinding, ImageDraft, ImageId,
        RichBlockDraft, RichDocument, RichFlowParent, RichFlowPosition, RichListKind,
        RichLocalOutcome, RichLocalSession, RichSelection, RichSelectionKind, RichTextPoint,
        actions::{
            InsertBlocks, InsertText, ReplaceTextRange, RichAction, SetHeading, WrapList,
            apply_batch,
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
        SchemaId::new(QualifiedName::try_new("example/rich-range")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn fragment(text: &str, strong: bool) -> Result<TextFragment, Box<dyn std::error::Error>> {
    if text.is_empty() {
        return Ok(TextFragment::empty());
    }
    let formats = if strong {
        FormatSet::try_from_formats(vec![Format::new(
            QualifiedName::try_new("breditor/strong")?,
            PropertyMap::default(),
        )])?
    } else {
        FormatSet::default()
    };
    Ok(TextRun::try_new(text, formats)?.into())
}
fn point(
    block: &str,
    offset: u64,
    affinity: Affinity,
) -> Result<RichTextPoint, Box<dyn std::error::Error>> {
    Ok(RichTextPoint::new(BlockId::try_new(block)?, TextOffset::try_new(offset)?, affinity))
}
fn range(
    doc: &RichDocument,
    first: (&str, u64),
    last: (&str, u64),
) -> Result<RichSelection, Box<dyn std::error::Error>> {
    Ok(RichSelection::try_new(
        doc,
        RichSelectionKind::TextRange {
            anchor: point(first.0, first.1, Affinity::Before)?,
            focus: point(last.0, last.1, Affinity::After)?,
        },
    )?)
}
fn doc_from_root(
    context: &EditorContext,
    root: Value,
) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let mut input = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":context.schema().id().name().as_str(),"version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),"root":null});
    input["root"] = root;
    let document = DocumentJsonCodecV2::new(context.schema().clone()).decode(&input.to_string())?;
    Ok(RichDocument::try_admit(context.schema(), document, context.limits())?)
}
fn fixture(context: &EditorContext) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let original = doc_from_root(
        context,
        serde_json::from_str(include_str!(
            "../../../experiments/collaboration/browser/rich-ast-root.json"
        ))?,
    )?;
    let tail = RichBlockDraft::paragraph(&BlockId::try_new("tail")?, &fragment("tail🙂X", false)?)?;
    let end =
        RichBlockDraft::paragraph(&BlockId::try_new("outside")?, &fragment("Outside", false)?)?;
    Ok(InsertBlocks::capture(
        &original,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        vec![tail, end],
    )?
    .apply(context, &original)?
    .ok_or("insert")?
    .into_parts()
    .0)
}
fn text(doc: &RichDocument, block: &str) -> Result<String, Box<dyn std::error::Error>> {
    let node = doc
        .document()
        .node_at(doc.block_path(&BlockId::try_new(block)?).ok_or("block")?)?
        .as_element()
        .ok_or("text block")?;
    Ok(node
        .children()
        .iter()
        .filter_map(breditor_core::document::NodeRef::as_text)
        .map(breditor_core::document::TextNode::text)
        .collect())
}
fn selection_point(
    selection: &RichSelection,
) -> Result<&RichTextPoint, Box<dyn std::error::Error>> {
    let RichSelectionKind::TextRange { focus, .. } = selection.kind() else {
        return Err("text selection".into());
    };
    Ok(focus)
}

#[test]
fn range_replacement_preserves_first_kind_prefix_and_last_formatted_suffix() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let selected = range(&doc, ("heading-one", 5), ("tail", 1))?;
    let action = ReplaceTextRange::capture(&doc, &selected, &fragment("!", false)?)?;
    let edit = action.apply(&context, &doc)?.ok_or("replace")?;
    assert_eq!(text(edit.document(), "heading-one")?, "Rich !ail🙂X");
    assert!(edit.document().block_path(&BlockId::try_new("tail")?).is_none());
    assert_eq!(edit.document().table_ids().len(), 0);
    assert_eq!(edit.document().image_ids().len(), 0);
    assert_eq!(text(edit.document(), "outside")?, "Outside");
    let node = edit
        .document()
        .document()
        .node_at(edit.document().block_path(&BlockId::try_new("heading-one")?).ok_or("heading")?)?
        .as_element()
        .ok_or("heading")?;
    assert_eq!(node.kind().as_str(), "breditor/heading");
    assert_eq!(
        node.children()
            .get(0)
            .and_then(breditor_core::document::NodeRef::as_text)
            .ok_or("prefix")?
            .formats()
            .len(),
        1
    );
    assert_eq!(action.insertion_end(), &point("heading-one", 6, Affinity::After)?);
    let undo = edit.inverse().apply(&context, edit.document())?.ok_or("undo")?;
    assert_eq!(undo.document().document(), doc.document());
    let redo = undo.inverse().apply(&context, undo.document())?.ok_or("redo")?;
    assert_eq!(redo.document().document(), edit.document().document());
    Ok(())
}

#[test]
fn preserved_suffix_and_deleted_nested_caption_positions_have_witnessed_maps() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let edit = ReplaceTextRange::capture(
        &doc,
        &range(&doc, ("heading-one", 5), ("tail", 1))?,
        &fragment("!", false)?,
    )?
    .apply(&context, &doc)?
    .ok_or("edit")?;
    for (block, offset, affinity, target) in [
        ("heading-one", 2, Affinity::After, 2),
        ("tail", 6, Affinity::After, 11),
        ("caption-one", 3, Affinity::Before, 5),
        ("caption-one", 3, Affinity::After, 6),
    ] {
        let point = point(block, offset, affinity)?;
        let source = RichSelection::try_new(
            &doc,
            RichSelectionKind::TextRange { anchor: point.clone(), focus: point },
        )?;
        let mapped = edit.map_selection(&source)?.into_selection().ok_or("mapped")?;
        assert_eq!(selection_point(&mapped)?, &self::point("heading-one", target, affinity)?);
    }
    let point = point("heading-one", 11, Affinity::After)?;
    let suffix = RichSelection::try_new(
        edit.document(),
        RichSelectionKind::TextRange { anchor: point.clone(), focus: point },
    )?;
    let undo = edit.inverse().apply(&context, edit.document())?.ok_or("undo")?;
    let mapped = undo.map_selection(&suffix)?.into_selection().ok_or("suffix map")?;
    assert_eq!(selection_point(&mapped)?, &self::point("tail", 6, Affinity::After)?);
    Ok(())
}

#[test]
fn sibling_list_range_removes_selected_first_media_and_retains_last_item_tail() -> TestResult {
    let context = context()?;
    let mut doc = fixture(&context)?;
    let caption = RichBlockDraft::paragraph(
        &BlockId::try_new("last-tail")?,
        &fragment("Retained tail", false)?,
    )?;
    let binding = ImageBinding::new(
        ImageId::try_new("tail-image")?,
        AssetId::try_new("immutable-asset")?,
        AssetGeneration::try_new("tail-generation")?,
        ImageAlt::try_description("Retained image".into())?,
        None,
    );
    let body: RichBlockDraft =
        ImageDraft::try_new(&BlockId::try_new("tail-image-block")?, &binding, Some(caption))?
            .into();
    let insert = InsertBlocks::capture(
        &doc,
        &RichFlowPosition::new(RichFlowParent::Document, Some(BlockId::try_new("outside")?)),
        vec![body],
    )?;
    doc = insert.apply(&context, &doc)?.ok_or("insert")?.into_parts().0;
    let wrap = WrapList::capture(
        &doc,
        &BlockId::try_new("heading-one")?,
        &BlockId::try_new("outside")?,
        &BlockId::try_new("list")?,
        &[BlockId::try_new("i0")?, BlockId::try_new("i1")?, BlockId::try_new("i2")?],
        RichListKind::Ordered(OrderedListStart::try_new(3)?),
    )?;
    doc = wrap.apply(&context, &doc)?.ok_or("wrap")?.into_parts().0;
    let action = ReplaceTextRange::capture(
        &doc,
        &range(&doc, ("heading-one", 5), ("tail", 1))?,
        &fragment("!", false)?,
    )?;
    let edit = action.apply(&context, &doc)?.ok_or("edit")?;
    assert_eq!(text(edit.document(), "heading-one")?, "Rich !ail🙂X");
    assert_eq!(text(edit.document(), "last-tail")?, "Retained tail");
    assert!(edit.document().block_path(&BlockId::try_new("i1")?).is_none());
    assert_eq!(edit.document().image_ids().len(), 1);
    assert!(edit.document().image(&ImageId::try_new("tail-image")?)?.is_some());
    let caption_point = point("last-tail", 3, Affinity::After)?;
    let caption = RichSelection::try_new(
        &doc,
        RichSelectionKind::TextRange {
            anchor: caption_point.clone(),
            focus: caption_point.clone(),
        },
    )?;
    let mapped = edit.map_selection(&caption)?.into_selection().ok_or("caption map")?;
    assert_eq!(selection_point(&mapped)?, &caption_point);
    let undo = edit.inverse().apply(&context, edit.document())?.ok_or("undo")?;
    assert_eq!(undo.document().document(), doc.document());
    Ok(())
}

#[test]
fn only_final_aggregate_text_budget_is_checked_not_an_oversized_intermediate() -> TestResult {
    let context = context()?;
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[
        {"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"first"},"children":[{"kind":"text","text":"a","formats":[]}]},
        {"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"last"},"children":[{"kind":"text","text":"b".repeat(100),"formats":[]}]}]});
    let doc = doc_from_root(&context, root)?;
    let tight = EditorContext::new(
        context.schema().clone(),
        DocumentLimits::default().with_max_total_text_bytes(101),
    );
    let action = ReplaceTextRange::capture(
        &doc,
        &range(&doc, ("first", 0), ("last", 100))?,
        &fragment(&"Z".repeat(99), false)?,
    )?;
    let edit = action.apply(&tight, &doc)?.ok_or("edit")?;
    assert_eq!(text(edit.document(), "first")?, "Z".repeat(99));
    Ok(())
}

#[test]
fn owner_inline_replacement_collapses_advances_and_recovers_exact_history() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let selected = range(&doc, ("tail", 1), ("heading-one", 5))?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        doc.clone(),
        Some(selected.kind().clone()),
        HistoryCapacity::default(),
    )?;
    owner.replace_selection_text(&owner.snapshot(), &fragment("!", true)?)?;
    assert_eq!(
        selection_point(owner.state().selection().ok_or("caret")?)?,
        &point("heading-one", 6, Affinity::After)?
    );
    assert_eq!(owner.state().pending_formats().ok_or("pending")?.len(), 1);
    let final_doc = owner.state().document().document().clone();
    let codec = RichSessionJsonCodec::new(context);
    owner = codec.decode(&codec.encode(&owner)?)?;
    owner.undo(&owner.snapshot())?;
    assert_eq!(owner.state().document().document(), doc.document());
    assert_eq!(owner.state().selection().map(RichSelection::kind), Some(selected.kind()));
    owner.redo(&owner.snapshot())?;
    assert_eq!(owner.state().document().document(), &final_doc);
    assert_eq!(owner.state().pending_formats().ok_or("pending")?.len(), 1);
    Ok(())
}

#[test]
fn plain_range_typing_uses_logical_start_style_in_both_selection_directions() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    for reverse in [false, true] {
        let first = point("heading-one", 5, Affinity::After)?;
        let last = point("tail", 1, Affinity::After)?;
        let kind = if reverse {
            RichSelectionKind::TextRange { anchor: last, focus: first }
        } else {
            RichSelectionKind::TextRange { anchor: first, focus: last }
        };
        let mut owner = RichLocalSession::try_new(
            context.clone(),
            doc.clone(),
            Some(kind),
            HistoryCapacity::default(),
        )?;
        owner.replace_selection_plain_text(&owner.snapshot(), "typed")?;
        owner.replace_selection_plain_text(&owner.snapshot(), "!")?;
        assert_eq!(text(owner.state().document(), "heading-one")?, "Rich typed!ail🙂X");
        assert_eq!(owner.state().pending_formats().ok_or("pending")?.len(), 1);
    }
    Ok(())
}

#[test]
fn collapsed_empty_input_preserves_affinity_token_and_redo() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let point = point("heading-one", 5, Affinity::Before)?;
    let mut owner = RichLocalSession::try_new(
        context,
        doc,
        Some(RichSelectionKind::TextRange { anchor: point.clone(), focus: point }),
        HistoryCapacity::default(),
    )?;
    owner.replace_selection_plain_text(&owner.snapshot(), "x")?;
    owner.undo(&owner.snapshot())?;
    let snapshot = owner.snapshot();
    let revision = owner.state().revision();
    assert_eq!(
        owner.replace_selection_text(&snapshot, &TextFragment::empty())?,
        RichLocalOutcome::Unchanged
    );
    assert_eq!(owner.replace_selection_plain_text(&snapshot, "")?, RichLocalOutcome::Unchanged);
    assert_eq!(owner.state().revision(), revision);
    assert_eq!(owner.redo_depth(), 1);
    owner.redo(&snapshot)?;
    Ok(())
}

#[test]
fn stale_source_and_unsupported_cross_cell_ranges_cannot_publish_partial_work() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let action = ReplaceTextRange::capture(
        &doc,
        &range(&doc, ("heading-one", 5), ("tail", 1))?,
        &fragment("!", false)?,
    )?;
    let changed = SetHeading::capture(&doc, &BlockId::try_new("tail")?, Some(3))?
        .apply(&context, &doc)?
        .ok_or("heading")?
        .into_parts()
        .0;
    assert!(action.apply(&context, &changed).is_err());
    let selected = range(&doc, ("body-00", 1), ("body-11", 1))?;
    let mut owner = RichLocalSession::try_new(
        context,
        doc.clone(),
        Some(selected.kind().clone()),
        HistoryCapacity::default(),
    )?;
    assert!(owner.replace_selection_plain_text(&owner.snapshot(), "bad").is_err());
    assert_eq!(owner.state().document().document(), doc.document());
    assert_eq!(owner.undo_depth(), 0);
    assert_eq!(owner.state().selection().map(RichSelection::kind), Some(selected.kind()));
    Ok(())
}

#[test]
fn range_then_typing_composes_witnessed_maps_without_losing_the_retained_suffix() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let action = ReplaceTextRange::capture(
        &doc,
        &range(&doc, ("heading-one", 5), ("tail", 1))?,
        &fragment("!", false)?,
    )?;
    let staged = action.apply(&context, &doc)?.ok_or("range")?;
    let typing =
        InsertText::capture(staged.document(), action.insertion_end(), &fragment("?", true)?)?;
    let edited = apply_batch(
        &context,
        &doc,
        &[RichAction::ReplaceTextRange(action), RichAction::InsertText(typing)],
    )?
    .ok_or("group")?;
    assert_eq!(text(edited.document(), "heading-one")?, "Rich !?ail🙂X");
    let point = point("tail", 6, Affinity::After)?;
    let source = RichSelection::try_new(
        &doc,
        RichSelectionKind::TextRange { anchor: point.clone(), focus: point },
    )?;
    let mapped = edited.map_selection(&source)?.into_selection().ok_or("mapped")?;
    assert_eq!(selection_point(&mapped)?, &self::point("heading-one", 12, Affinity::After)?);
    Ok(())
}

#[test]
fn caret_typing_respects_focus_affinity_when_zero_length_endpoints_have_different_affinities()
-> TestResult {
    let context = context()?;
    let root = json!({"kind":"element","type":"breditor/document","entityId":null,"properties":{"breditor/document-id":"room"},"children":[
        {"kind":"element","type":"breditor/paragraph","entityId":null,"properties":{"breditor/block-id":"p"},"children":[
            {"kind":"text","text":"a","formats":[{"type":"breditor/strong","properties":{}}]},
            {"kind":"text","text":"b","formats":[]}]}]});
    let doc = doc_from_root(&context, root)?;
    let mut owner = RichLocalSession::try_new(
        context,
        doc,
        Some(RichSelectionKind::TextRange {
            anchor: point("p", 1, Affinity::Before)?,
            focus: point("p", 1, Affinity::After)?,
        }),
        HistoryCapacity::default(),
    )?;
    owner.replace_selection_plain_text(&owner.snapshot(), "X")?;
    assert_eq!(text(owner.state().document(), "p")?, "aXb");
    assert_eq!(owner.state().pending_formats(), Some(&FormatSet::default()));
    Ok(())
}
