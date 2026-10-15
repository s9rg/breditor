#![cfg(feature = "experimental-rich-content")]
//! Structured rich copy/roundtrip/fresh paste with tables, media, lists and exact history.

use breditor_core::{
    block::OrderedListStart,
    codec::{DocumentJsonCodecV2, RichClipboardJsonCodec, RichSessionJsonCodec},
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, CausalStamp, CellId, ChangeId, ColumnId, ImageId, ReplicaId, RichBlockDraft,
        RichClipboardError, RichClipboardFragment, RichClipboardIdAllocator,
        RichClipboardIdentityKind, RichClipboardKind, RichDocument, RichFlowParent,
        RichFlowPosition, RichListKind, RichLocalSession, RichSelection, RichSelectionKind,
        RichSelectionUpdate, RichTextPoint, RowId, TableId,
        actions::{
            InsertBlocks, PasteTableCells, ReplaceText, RichAction, SplitTableCell, WrapList,
        },
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    session::HistoryCapacity,
    state::EditorContext,
};
use serde_json::{Value, json};
type TestResult = Result<(), Box<dyn std::error::Error>>;

#[test]
fn rekeyed_semantic_tree_is_admitted_without_an_intermediate_local_edit() -> TestResult {
    let context = context()?;
    let document = fixture(&context)?;
    let fragment = copied(&context, &document, &grid(&document)?)?;
    let original = RichClipboardJsonCodec::new(context.clone()).encode(&fragment)?;
    let mut ids = Ids::default();
    let fresh = fragment.rekeyed(&context, &mut ids)?;
    assert_eq!(fresh.kind(), fragment.kind());
    assert_eq!(fresh.plain_text()?, fragment.plain_text()?);
    assert!(ids.counter > 0);
    let codec = RichClipboardJsonCodec::new(context.clone());
    let json = codec.encode(&fresh)?;
    assert_ne!(json, original);
    assert_eq!(codec.encode(&codec.decode(&json)?)?, json);
    assert_eq!(codec.encode(&fragment)?, original);
    let old_images: Vec<_> = fragment.document().image_ids().cloned().collect();
    let new_images: Vec<_> = fresh.document().image_ids().cloned().collect();
    assert_eq!(old_images.len(), new_images.len());
    assert!(new_images.iter().all(|id| !old_images.contains(id)));
    Ok(())
}

fn context() -> Result<EditorContext, Box<dyn std::error::Error>> {
    let schema = CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(
            QualifiedName::try_new("example/rich-clipboard")?,
            SchemaVersion::try_new(1)?,
        ),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn fixture(context: &EditorContext) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let value = json!({"format":"breditor/document","formatVersion":2,"schema":{"name":context.schema().id().name().as_str(),"version":1},"schemaFingerprint":context.schema().fingerprint().to_string(),
        "root":serde_json::from_str::<Value>(include_str!("../../../experiments/collaboration/browser/rich-ast-root.json"))?});
    let doc = DocumentJsonCodecV2::new(context.schema().clone()).decode(&value.to_string())?;
    Ok(RichDocument::try_admit(context.schema(), doc, context.limits())?)
}
fn cell(r: &str, c: &str) -> Result<CellId, Box<dyn std::error::Error>> {
    Ok(CellId::new(TableId::try_new("table-one")?, RowId::try_new(r)?, ColumnId::try_new(c)?))
}
fn grid(doc: &RichDocument) -> Result<RichSelection, Box<dyn std::error::Error>> {
    let cell = cell("r1", "c1")?;
    Ok(RichSelection::try_new(doc, RichSelectionKind::Grid { anchor: cell.clone(), focus: cell })?)
}
fn point(block: &str, offset: u64) -> Result<RichTextPoint, Box<dyn std::error::Error>> {
    Ok(RichTextPoint::new(BlockId::try_new(block)?, TextOffset::try_new(offset)?, Affinity::After))
}
fn node(doc: &RichDocument, block: &str) -> Result<RichSelection, Box<dyn std::error::Error>> {
    Ok(RichSelection::try_new(doc, RichSelectionKind::Node(BlockId::try_new(block)?))?)
}
fn bytes(
    context: &EditorContext,
    doc: &RichDocument,
) -> Result<String, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(context.schema().clone()).encode(doc.document())?)
}
fn copied(
    context: &EditorContext,
    doc: &RichDocument,
    selection: &RichSelection,
) -> Result<RichClipboardFragment, Box<dyn std::error::Error>> {
    Ok(RichClipboardFragment::copy_selection(context, doc, selection)?.ok_or("clipboard")?)
}

#[derive(Default)]
struct Ids {
    counter: u64,
}
impl RichClipboardIdAllocator for Ids {
    fn next(&mut self, kind: RichClipboardIdentityKind) -> Result<String, RichClipboardError> {
        self.counter += 1;
        Ok(format!("paste-{kind:?}-{}", self.counter))
    }
    fn merge_stamp(&mut self) -> Result<CausalStamp, RichClipboardError> {
        Ok(CausalStamp::new(
            100,
            ChangeId::new(ReplicaId::try_new(7).map_err(|_| RichClipboardError::Allocation)?, 10),
        ))
    }
}
fn copy_paste_owner(
    context: &EditorContext,
    doc: RichDocument,
    selection: &RichSelection,
    action: RichAction,
) -> Result<RichLocalSession, Box<dyn std::error::Error>> {
    let before = bytes(context, &doc)?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        doc,
        Some(selection.kind().clone()),
        HistoryCapacity::default(),
    )?;
    owner.dispatch(&owner.snapshot(), &[action], RichSelectionUpdate::Map)?;
    let after = bytes(context, owner.state().document())?;
    let codec = RichSessionJsonCodec::new(context.clone());
    owner = codec.decode(&codec.encode(&owner)?)?;
    owner.undo(&owner.snapshot())?;
    assert_eq!(bytes(context, owner.state().document())?, before);
    owner.redo(&owner.snapshot())?;
    assert_eq!(bytes(context, owner.state().document())?, after);
    Ok(owner)
}

#[test]
fn reversed_scalar_text_copy_roundtrips_formats_and_pastes_as_inline_content() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let selection = RichSelection::try_new(
        &doc,
        RichSelectionKind::TextRange {
            anchor: point("heading-one", 7)?,
            focus: point("heading-one", 5)?,
        },
    )?;
    let fragment = copied(&context, &doc, &selection)?;
    assert_eq!(fragment.kind(), RichClipboardKind::Text);
    assert_eq!(fragment.plain_text()?, "🙂");
    let codec = RichClipboardJsonCodec::new(context.clone());
    let wire = codec.encode(&fragment)?;
    let fragment = codec.decode(&wire)?;
    assert_eq!(codec.encode(&fragment)?, wire);
    let text = fragment.text_fragment(&context)?;
    assert_eq!(
        text.iter().next().ok_or("run")?.formats().iter().next().ok_or("format")?.kind().as_str(),
        "breditor/strong"
    );
    let target = RichSelection::try_new(
        &doc,
        RichSelectionKind::TextRange { anchor: point("body-00", 5)?, focus: point("body-00", 5)? },
    )?;
    let action = ReplaceText::capture(
        &doc,
        &BlockId::try_new("body-00")?,
        TextOffset::ZERO,
        TextOffset::try_new(5)?,
        &text,
    )?;
    let owner = copy_paste_owner(&context, doc, &target, RichAction::ReplaceText(action))?;
    let value: Value = serde_json::from_str(&bytes(&context, owner.state().document())?)?;
    assert_eq!(
        value["root"]["children"][1]["children"][0]["children"][0]["children"][0]["children"][0]["text"],
        "🙂"
    );
    Ok(())
}

#[test]
fn covered_grid_copy_preserves_all_base_bodies_headers_widths_and_media() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let fragment = copied(&context, &doc, &grid(&doc)?)?;
    assert_eq!(fragment.kind(), RichClipboardKind::Grid);
    let view = fragment.document().table(&TableId::try_new("table-one")?)?.ok_or("table")?;
    assert_eq!(view.rows().len(), 2);
    assert_eq!(
        view.columns()
            .iter()
            .map(breditor_core::rich_content::RichColumn::width)
            .collect::<Vec<_>>(),
        vec![120, 240]
    );
    assert_eq!(view.geometry().cells()[0].source_cells().len(), 4);
    assert_eq!(fragment.document().cell_entries().len(), 4);
    assert_eq!(
        fragment.plain_text()?,
        "first\tsecond 🙂\nthird e\u{301}\t\"fourth\nCovered cell landscape\nCaption survives merge\""
    );
    let codec = RichClipboardJsonCodec::new(context.clone());
    let wire = codec.encode(&fragment)?;
    assert_eq!(codec.encode(&codec.decode(&wire)?)?, wire);
    Ok(())
}

#[test]
fn structured_grid_paste_rekeys_bodies_and_merge_priority_with_exact_reload_history() -> TestResult
{
    let context = context()?;
    let doc = fixture(&context)?;
    let selection = grid(&doc)?;
    let fragment = copied(&context, &doc, &selection)?;
    let draft = fragment.table_paste_draft(&context, &mut Ids::default())?;
    assert_eq!(draft.dimensions(), (2, 2));
    let action = PasteTableCells::capture(&doc, &selection, draft)?;
    let owner = copy_paste_owner(&context, doc, &selection, RichAction::PasteTableCells(action))?;
    let doc = owner.state().document();
    let table = doc.table(&TableId::try_new("table-one")?)?.ok_or("table")?;
    assert_eq!(table.geometry().cells()[0].source_cells().len(), 4);
    assert_ne!(
        table.geometry().active_regions()[0],
        breditor_core::rich_content::MergeId::try_new("merge-one")?
    );
    assert!(doc.block_path(&BlockId::try_new("body-00")?).is_none());
    assert!(doc.block_path(&BlockId::try_new("cell-block-00")?).is_some());
    let image = doc.image_ids().next().ok_or("image")?;
    assert_ne!(image, &ImageId::try_new("covered-image")?);
    let binding = doc.image(image)?.ok_or("binding")?;
    assert_eq!(binding.asset().as_str(), "immutable-asset");
    assert_ne!(binding.generation().as_str(), "generation-one");
    let value: Value = serde_json::from_str(&bytes(&context, doc)?)?;
    let records =
        value["root"]["children"][1]["properties"]["breditor/merges"].as_array().ok_or("merges")?;
    let new = records
        .iter()
        .find(|value| value["id"] == table.geometry().active_regions()[0].as_str())
        .ok_or("new merge")?;
    assert_eq!(new["lamport"], "100");
    assert_eq!(new["writer"], "7");
    Ok(())
}

#[test]
fn copying_an_image_preserves_asset_alt_size_caption_but_creates_new_binding_identity() -> TestResult
{
    let context = context()?;
    let doc = fixture(&context)?;
    let selection = node(&doc, "covered-image-block")?;
    let fragment = copied(&context, &doc, &selection)?;
    let drafts = fragment.flow_drafts(&context, &mut Ids::default())?;
    let action = InsertBlocks::capture(
        &doc,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        drafts,
    )?;
    let owner = copy_paste_owner(&context, doc, &selection, RichAction::InsertBlocks(action))?;
    assert_eq!(owner.state().document().image_ids().len(), 2);
    let new = owner
        .state()
        .document()
        .image_ids()
        .find(|id| id.as_str() != "covered-image")
        .ok_or("new image")?;
    let binding = owner.state().document().image(new)?.ok_or("binding")?;
    assert_eq!(binding.asset().as_str(), "immutable-asset");
    assert_eq!(binding.size(), Some(breditor_core::rich_content::ImageSize::try_new(640, 480)?));
    assert_eq!(binding.alt().text(), "Covered cell landscape");
    assert_ne!(binding.generation().as_str(), "generation-one");
    let fragment = copied(
        &context,
        owner.state().document(),
        &RichSelection::try_new(
            owner.state().document(),
            RichSelectionKind::Node(BlockId::try_new("caption-one")?),
        )?,
    )?;
    assert_eq!(fragment.plain_text()?, "Caption survives merge");
    Ok(())
}

#[test]
fn whole_table_flow_copy_rekeys_axes_and_keeps_source_table_independent() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let selection = node(&doc, "table-block")?;
    let fragment = copied(&context, &doc, &selection)?;
    let action = InsertBlocks::capture(
        &doc,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        fragment.flow_drafts(&context, &mut Ids::default())?,
    )?;
    let owner = copy_paste_owner(&context, doc, &selection, RichAction::InsertBlocks(action))?;
    let doc = owner.state().document();
    assert_eq!(doc.table_ids().len(), 2);
    assert_eq!(doc.cell_entries().len(), 8);
    let id = doc.table_ids().find(|id| id.as_str() != "table-one").ok_or("copied table")?;
    let table = doc.table(id)?.ok_or("table")?;
    assert!(table.rows().iter().all(|id| id.as_str() != "r0" && id.as_str() != "r1"));
    assert!(
        table
            .columns()
            .iter()
            .all(|column| column.id().as_str() != "c0" && column.id().as_str() != "c1")
    );
    assert_eq!(table.geometry().cells()[0].source_cells().len(), 4);
    Ok(())
}

fn appended(
    context: &EditorContext,
    doc: &RichDocument,
) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let nodes = [("tail", "end"), ("last", "third")]
        .into_iter()
        .map(|(id, text)| {
            let text: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
            Ok(RichBlockDraft::paragraph(&BlockId::try_new(id)?, &text)?)
        })
        .collect::<Result<Vec<_>, Box<dyn std::error::Error>>>()?;
    Ok(InsertBlocks::capture(doc, &RichFlowPosition::new(RichFlowParent::Document, None), nodes)?
        .apply(context, doc)?
        .ok_or("insert")?
        .into_parts()
        .0)
}

#[test]
fn cross_block_copy_keeps_partial_endpoints_and_intervening_table_media() -> TestResult {
    let context = context()?;
    let doc = appended(&context, &fixture(&context)?)?;
    let selection = RichSelection::try_new(
        &doc,
        RichSelectionKind::TextRange { anchor: point("tail", 2)?, focus: point("heading-one", 5)? },
    )?;
    let fragment = copied(&context, &doc, &selection)?;
    assert_eq!(fragment.kind(), RichClipboardKind::Flow);
    let value: Value = serde_json::from_str(&bytes(&context, fragment.document())?)?;
    assert_eq!(value["root"]["children"].as_array().ok_or("flow")?.len(), 3);
    assert_eq!(value["root"]["children"][0]["children"][0]["text"], "🙂 document");
    assert_eq!(value["root"]["children"][0]["properties"]["breditor/level"], 2);
    assert_eq!(value["root"]["children"][2]["children"][0]["text"], "en");
    assert_eq!(fragment.document().image_ids().len(), 1);
    Ok(())
}

#[test]
fn partial_sibling_list_copy_preserves_ordinals_and_rich_first_item_tails() -> TestResult {
    let context = context()?;
    let doc = appended(&context, &fixture(&context)?)?;
    let wrap = WrapList::capture(
        &doc,
        &BlockId::try_new("heading-one")?,
        &BlockId::try_new("last")?,
        &BlockId::try_new("list")?,
        &[BlockId::try_new("i0")?, BlockId::try_new("i1")?, BlockId::try_new("i2")?],
        RichListKind::Ordered(OrderedListStart::try_new(3)?),
    )?;
    let doc = wrap.apply(&context, &doc)?.ok_or("wrap")?.into_parts().0;
    for (start, end, ordinal, has_media) in [
        (point("heading-one", 5)?, point("tail", 2)?, 3, true),
        (point("tail", 1)?, point("last", 2)?, 4, false),
    ] {
        let selection = RichSelection::try_new(
            &doc,
            RichSelectionKind::TextRange { anchor: end, focus: start },
        )?;
        let fragment = copied(&context, &doc, &selection)?;
        let value: Value = serde_json::from_str(&bytes(&context, fragment.document())?)?;
        assert_eq!(value["root"]["children"][0]["properties"]["breditor/start"], ordinal);
        assert_eq!(fragment.document().image_ids().len() == 1, has_media);
        let action = InsertBlocks::capture(
            &doc,
            &RichFlowPosition::new(RichFlowParent::Document, None),
            fragment.flow_drafts(&context, &mut Ids::default())?,
        )?;
        let edited = action.apply(&context, &doc)?.ok_or("paste")?;
        assert_eq!(
            edited.document().document().root().as_element().ok_or("root")?.children().len(),
            2
        );
    }
    Ok(())
}

#[test]
fn semantic_clipboard_drops_split_merge_history_but_never_base_content() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let split = SplitTableCell::capture(&doc, &cell("r1", "c1")?)?;
    let doc = split.apply(&context, &doc)?.ok_or("split")?.into_parts().0;
    let fragment = copied(&context, &doc, &node(&doc, "table-block")?)?;
    let codec = RichClipboardJsonCodec::new(context.clone());
    let wire = codec.encode(&fragment)?;
    let mut record: Value = serde_json::from_str(&wire)?;
    assert_eq!(
        record["document"]["root"]["children"][0]["properties"]["breditor/merges"],
        json!([])
    );
    assert_eq!(fragment.document().cell_entries().len(), 4);
    assert_eq!(fragment.document().image_ids().len(), 1);
    let source: Value = serde_json::from_str(&bytes(&context, &doc)?)?;
    record["document"]["root"]["children"][0]["properties"]["breditor/merges"] =
        source["root"]["children"][1]["properties"]["breditor/merges"].clone();
    record["document"]["root"]["children"][0]["properties"]["breditor/retracted-merges"] =
        json!(["merge-one"]);
    assert!(codec.decode(&record.to_string()).is_err());
    Ok(())
}

struct FixedIds(&'static str);
impl RichClipboardIdAllocator for FixedIds {
    fn next(&mut self, _kind: RichClipboardIdentityKind) -> Result<String, RichClipboardError> {
        Ok(self.0.to_owned())
    }
    fn merge_stamp(&mut self) -> Result<CausalStamp, RichClipboardError> {
        Err(RichClipboardError::Allocation)
    }
}
#[test]
fn failed_allocation_or_receiving_policy_cannot_publish_or_reuse_source_ids() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let before = bytes(&context, &doc)?;
    let fragment = copied(&context, &doc, &node(&doc, "covered-image-block")?)?;
    for value in ["covered-image-block", "new-duplicate", "invalid space"] {
        assert!(fragment.flow_drafts(&context, &mut FixedIds(value)).is_err());
    }
    let limited =
        EditorContext::new(context.schema().clone(), DocumentLimits::default().with_max_nodes(1));
    let mut ids = Ids::default();
    assert!(fragment.flow_drafts(&limited, &mut ids).is_err());
    assert_eq!(ids.counter, 0);
    assert_eq!(bytes(&context, &doc)?, before);
    Ok(())
}

#[test]
fn clipboard_codec_enforces_independent_bytes_kind_and_schema_binding() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let fragment = copied(&context, &doc, &grid(&doc)?)?;
    let codec = RichClipboardJsonCodec::new(context.clone());
    let wire = codec.encode(&fragment)?;
    let tiny = codec.clone().with_max_json_bytes(wire.len() - 1);
    assert!(tiny.encode(&fragment).is_err());
    assert!(tiny.decode(&wire).is_err());
    let mut record: Value = serde_json::from_str(&wire)?;
    record["kind"] = json!("text");
    assert!(codec.decode(&record.to_string()).is_err());
    record["kind"] = json!("grid");
    record["document"]["schemaFingerprint"] =
        json!("sha256:0000000000000000000000000000000000000000000000000000000000000000");
    assert!(codec.decode(&record.to_string()).is_err());
    Ok(())
}

#[test]
fn rectangular_paste_never_silently_tiles_or_crops_a_decoded_grid() -> TestResult {
    let context = context()?;
    let doc = fixture(&context)?;
    let fragment = copied(&context, &doc, &grid(&doc)?)?;
    let split = SplitTableCell::capture(&doc, &cell("r1", "c1")?)?;
    let target = split.apply(&context, &doc)?.ok_or("split")?.into_parts().0;
    let draft = fragment.table_paste_draft(&context, &mut Ids::default())?;
    assert!(PasteTableCells::capture(&target, &grid(&target)?, draft).is_err());
    Ok(())
}
