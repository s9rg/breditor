#![cfg(feature = "experimental-rich-content")]
//! Functional rich paragraph/list boundaries, body ordering and exact owner history.

use breditor_core::{
    block::OrderedListStart,
    codec::DocumentJsonCodecV2,
    document::{FormatSet, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        AssetGeneration, AssetId, BlockId, CausalStamp, CellId, ChangeId, ColumnId, ImageAlt,
        ImageBinding, ImageDraft, ImageId, MergeId, ReplicaId, RichBlockDraft, RichDocument,
        RichFlowParent, RichFlowPosition, RichListDraft, RichListItemDraft, RichListKind,
        RichLocalSession, RichSelection, RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        RowId, TableCellPasteDraft, TableId, TablePasteDraft, TablePasteMerge,
        actions::{
            ClearTableCells, IndentListItems, InsertBlocks, InsertText, JoinListItems,
            JoinTextBlocks, MergeTableCells, OutdentListItems, PasteTableCells, ReplaceBlocks,
            RichAction, RichEdit, SetListKind, SplitListItem, SplitTextBlock, UnwrapList, WrapList,
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
        SchemaId::new(QualifiedName::try_new("example/rich-flow")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?;
    Ok(EditorContext::new(schema, DocumentLimits::default()))
}
fn fixture() -> Result<Value, Box<dyn std::error::Error>> {
    Ok(serde_json::from_str(include_str!("fixtures/rich-local-root.json"))?)
}
fn body_mut(root: &mut Value) -> Result<&mut Vec<Value>, Box<dyn std::error::Error>> {
    root["children"][0]["children"][0]["children"][0]["children"]
        .as_array_mut()
        .ok_or_else(|| "cell body".into())
}
fn element(kind: &str, id: &str, children: Vec<Value>) -> Value {
    let mut value = json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,
        "properties":{"breditor/block-id":id}});
    value["children"] = children.into();
    value
}
fn paragraph(id: &str, text: &str) -> Value {
    element("paragraph", id, vec![json!({"kind":"text","text":text,"formats":[]})])
}
fn item(id: &str, text_id: &str, text: &str, tail: Vec<Value>) -> Value {
    let mut children = vec![paragraph(text_id, text)];
    children.extend(tail);
    element("list-item", id, children)
}
fn list(id: &str, start: Option<u32>, items: Vec<Value>) -> Value {
    let mut value =
        element(if start.is_some() { "ordered-list" } else { "bullet-list" }, id, items);
    if let Some(start) = start {
        value["properties"]["breditor/start"] = start.into();
    }
    value
}
fn admit(
    context: &EditorContext,
    root: &Value,
) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let value = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":context.schema().id().name().as_str(),"version":1},
        "schemaFingerprint":context.schema().fingerprint().to_string(),"root":root});
    let document = DocumentJsonCodecV2::new(context.schema().clone()).decode(&value.to_string())?;
    Ok(RichDocument::try_admit(context.schema(), document, context.limits())?)
}
fn bytes(
    context: &EditorContext,
    document: &RichDocument,
) -> Result<String, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(context.schema().clone()).encode(document.document())?)
}
fn value(
    context: &EditorContext,
    document: &RichDocument,
) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(serde_json::from_str::<Value>(&bytes(context, document)?)?["root"].clone())
}
fn block(id: &str) -> Result<BlockId, Box<dyn std::error::Error>> {
    Ok(BlockId::try_new(id)?)
}
fn point(
    id: &str,
    offset: u64,
    affinity: Affinity,
) -> Result<RichTextPoint, Box<dyn std::error::Error>> {
    Ok(RichTextPoint::new(block(id)?, TextOffset::try_new(offset)?, affinity))
}
fn caret(
    id: &str,
    offset: u64,
    affinity: Affinity,
) -> Result<RichSelectionKind, Box<dyn std::error::Error>> {
    let point = point(id, offset, affinity)?;
    Ok(RichSelectionKind::TextRange { anchor: point.clone(), focus: point })
}
fn location(selection: &RichSelection) -> Result<(&str, u64), Box<dyn std::error::Error>> {
    let RichSelectionKind::TextRange { focus, .. } = selection.kind() else {
        return Err("text selection".into());
    };
    Ok((focus.block().as_str(), focus.offset().get()))
}
fn check_inverse(context: &EditorContext, before: &RichDocument, edit: &RichEdit) -> TestResult {
    let undo = edit.inverse().apply(context, edit.document())?.ok_or("undo")?;
    assert_eq!(bytes(context, undo.document())?, bytes(context, before)?);
    let redo = undo.inverse().apply(context, undo.document())?.ok_or("redo")?;
    assert_eq!(bytes(context, redo.document())?, bytes(context, edit.document())?);
    Ok(())
}
fn reading_order(root: &Value) -> Vec<String> {
    fn visit(node: &Value, output: &mut Vec<String>) {
        if matches!(
            node["type"].as_str(),
            Some("breditor/paragraph" | "breditor/heading" | "breditor/image")
        ) && let Some(id) = node["properties"]["breditor/block-id"].as_str()
        {
            output.push(id.to_owned());
        }
        if let Some(children) = node["children"].as_array() {
            for child in children {
                visit(child, output);
            }
        }
    }
    let mut output = Vec::new();
    visit(root, &mut output);
    output
}
fn wrapped(context: &EditorContext) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let mut root = fixture()?;
    body_mut(&mut root)?.extend([paragraph("q", "second"), paragraph("z", "third")]);
    let original = admit(context, &root)?;
    let edit = WrapList::capture(
        &original,
        &block("p")?,
        &block("z")?,
        &block("list")?,
        &[block("i0")?, block("i1")?, block("i2")?],
        RichListKind::Ordered(OrderedListStart::try_new(3)?),
    )?
    .apply(context, &original)?
    .ok_or("wrap")?;
    Ok(edit.into_parts().0)
}

#[test]
fn cell_paragraph_split_maps_cut_affinity_and_retains_formats_image_and_caption() -> TestResult {
    let context = context()?;
    let original = admit(&context, &fixture()?)?;
    let edit = SplitTextBlock::capture(
        &original,
        &point("p", 1, Affinity::After)?,
        &block("right")?,
        Some(2),
    )?
    .apply(&context, &original)?
    .ok_or("split")?;
    for (offset, affinity, expected) in [
        (1, Affinity::Before, ("p", 1)),
        (1, Affinity::After, ("right", 0)),
        (3, Affinity::After, ("right", 2)),
    ] {
        let selected = RichSelection::try_new(&original, caret("p", offset, affinity)?)?;
        let mapping = edit.map_selection(&selected)?;
        assert_eq!(location(mapping.selection().ok_or("mapped")?)?, expected);
    }
    let mut root = value(&context, edit.document())?;
    let body = body_mut(&mut root)?;
    assert_eq!(body[0]["children"][0]["text"], "a");
    assert_eq!(body[1]["type"], "breditor/heading");
    assert_eq!(body[1]["children"][0]["text"], "🙂b");
    assert_eq!(body[1]["children"][0]["formats"][0]["type"], "breditor/strong");
    assert_eq!(body[2]["properties"]["breditor/image-id"], "image");
    check_inverse(&context, &original, &edit)
}

#[test]
fn joined_right_block_text_points_relocate_to_the_surviving_left_block() -> TestResult {
    let context = context()?;
    let original = admit(&context, &fixture()?)?;
    let split = SplitTextBlock::capture(
        &original,
        &point("p", 1, Affinity::After)?,
        &block("right")?,
        None,
    )?
    .apply(&context, &original)?
    .ok_or("split")?;
    let selected = RichSelection::try_new(split.document(), caret("right", 2, Affinity::After)?)?;
    let joined = JoinTextBlocks::capture(split.document(), &block("p")?, &block("right")?)?
        .apply(&context, split.document())?
        .ok_or("join")?;
    assert_eq!(bytes(&context, joined.document())?, bytes(&context, &original)?);
    assert_eq!(location(joined.map_selection(&selected)?.selection().ok_or("map")?)?, ("p", 3));
    check_inverse(&context, split.document(), &joined)
}

#[test]
fn split_type_and_join_maps_compose_over_new_block_identities_in_one_group() -> TestResult {
    let context = context()?;
    let original = admit(&context, &fixture()?)?;
    let selected = RichSelection::try_new(&original, caret("p", 3, Affinity::After)?)?;
    let split = RichAction::SplitTextBlock(SplitTextBlock::capture(
        &original,
        &point("p", 1, Affinity::After)?,
        &block("right")?,
        None,
    )?);
    let staged = split.apply(&context, &original)?.ok_or("split")?;
    let text: TextFragment = TextRun::try_new("X", FormatSet::default())?.into();
    let typing = RichAction::InsertText(InsertText::capture(
        staged.document(),
        &point("right", 0, Affinity::After)?,
        &text,
    )?);
    let next = typing.apply(&context, staged.document())?.ok_or("type")?;
    let join = RichAction::JoinTextBlocks(JoinTextBlocks::capture(
        next.document(),
        &block("p")?,
        &block("right")?,
    )?);
    let edit = apply_batch(&context, &original, &[split, typing, join])?.ok_or("group")?;
    assert_eq!(location(edit.map_selection(&selected)?.selection().ok_or("map")?)?, ("p", 4));
    let undo = apply_batch(&context, edit.document(), edit.inverse())?.ok_or("undo")?;
    assert_eq!(bytes(&context, undo.document())?, bytes(&context, &original)?);
    Ok(())
}

#[test]
fn wrapping_and_unwrapping_media_rich_flow_keeps_complete_reading_order_and_ids() -> TestResult {
    let context = context()?;
    let mut root = fixture()?;
    body_mut(&mut root)?.push(paragraph("q", "second"));
    let original = admit(&context, &root)?;
    let selected = RichSelection::try_new(&original, caret("caption", 2, Affinity::After)?)?;
    let wrapped = WrapList::capture(
        &original,
        &block("p")?,
        &block("q")?,
        &block("list")?,
        &[block("i0")?, block("i1")?],
        RichListKind::Bullet,
    )?
    .apply(&context, &original)?
    .ok_or("wrap")?;
    assert_eq!(reading_order(&value(&context, wrapped.document())?), reading_order(&root));
    assert_eq!(wrapped.map_selection(&selected)?.selection().ok_or("map")?.kind(), selected.kind());
    check_inverse(&context, &original, &wrapped)?;
    let unwrapped = UnwrapList::capture(wrapped.document(), &block("list")?)?
        .apply(&context, wrapped.document())?
        .ok_or("unwrap")?;
    assert_eq!(bytes(&context, unwrapped.document())?, bytes(&context, &original)?);
    check_inverse(&context, wrapped.document(), &unwrapped)
}

#[test]
fn list_style_and_start_conversion_preserve_node_selection_and_all_rich_bodies() -> TestResult {
    let context = context()?;
    let original = wrapped(&context)?;
    let selected = RichSelection::try_new(&original, RichSelectionKind::Node(block("list")?))?;
    let changed = SetListKind::capture(&original, &block("list")?, RichListKind::Bullet)?
        .apply(&context, &original)?
        .ok_or("style")?;
    assert_eq!(changed.map_selection(&selected)?.selection().ok_or("map")?.kind(), selected.kind());
    assert_eq!(
        reading_order(&value(&context, changed.document())?),
        reading_order(&value(&context, &original)?)
    );
    check_inverse(&context, &original, &changed)
}

#[test]
fn indenting_a_range_after_media_keeps_every_body_and_outdent_restores_exact_structure()
-> TestResult {
    let context = context()?;
    let original = wrapped(&context)?;
    let selected = RichSelection::try_new(&original, caret("z", 1, Affinity::After)?)?;
    let indented = IndentListItems::capture(
        &original,
        &block("list")?,
        &block("i1")?,
        &block("i2")?,
        Some((block("nested")?, RichListKind::Ordered(OrderedListStart::one()))),
    )?
    .apply(&context, &original)?
    .ok_or("indent")?;
    assert_eq!(
        reading_order(&value(&context, indented.document())?),
        reading_order(&value(&context, &original)?)
    );
    assert_eq!(
        indented.map_selection(&selected)?.selection().ok_or("map")?.kind(),
        selected.kind()
    );
    check_inverse(&context, &original, &indented)?;
    let outdented = OutdentListItems::capture(
        indented.document(),
        &block("nested")?,
        &block("i1")?,
        &block("i2")?,
        None,
    )?
    .apply(&context, indented.document())?
    .ok_or("outdent")?;
    assert_eq!(bytes(&context, outdented.document())?, bytes(&context, &original)?);
    check_inverse(&context, indented.document(), &outdented)
}

#[test]
fn indenting_into_an_existing_compatible_nested_list_preserves_its_start_and_id() -> TestResult {
    let context = context()?;
    let original = wrapped(&context)?;
    let first = IndentListItems::capture(
        &original,
        &block("list")?,
        &block("i1")?,
        &block("i1")?,
        Some((block("nested")?, RichListKind::Ordered(OrderedListStart::try_new(7)?))),
    )?
    .apply(&context, &original)?
    .ok_or("indent")?;
    let next = IndentListItems::capture(
        first.document(),
        &block("list")?,
        &block("i2")?,
        &block("i2")?,
        None,
    )?
    .apply(&context, first.document())?
    .ok_or("indent existing")?;
    let mut root = value(&context, next.document())?;
    let nested = &body_mut(&mut root)?[0]["children"][0]["children"][2];
    assert_eq!(nested["properties"]["breditor/block-id"], "nested");
    assert_eq!(nested["properties"]["breditor/start"], 7);
    assert_eq!(nested["children"].as_array().ok_or("items")?.len(), 2);
    check_inverse(&context, first.document(), &next)
}

#[test]
fn top_level_partial_outdent_preserves_numbered_prefix_tail_and_flow_order() -> TestResult {
    let context = context()?;
    let original = wrapped(&context)?;
    let outdent = OutdentListItems::capture(
        &original,
        &block("list")?,
        &block("i1")?,
        &block("i1")?,
        Some(&block("suffix")?),
    )?
    .apply(&context, &original)?
    .ok_or("outdent")?;
    let mut root = value(&context, outdent.document())?;
    let body = body_mut(&mut root)?;
    assert_eq!(body.len(), 3);
    assert_eq!(body[0]["properties"]["breditor/start"], 3);
    assert_eq!(body[1]["properties"]["breditor/block-id"], "q");
    assert_eq!(body[2]["properties"]["breditor/block-id"], "suffix");
    assert_eq!(body[2]["properties"]["breditor/start"], 5);
    assert_eq!(reading_order(&root), reading_order(&value(&context, &original)?));
    check_inverse(&context, &original, &outdent)
}

#[test]
fn nested_partial_outdent_moves_tail_and_later_parent_media_after_promoted_items() -> TestResult {
    let context = context()?;
    let mut root = fixture()?;
    let image = body_mut(&mut root)?[1].clone();
    let nested = list(
        "nested",
        Some(5),
        vec![
            item("a", "a-text", "A", vec![]),
            item("b", "b-text", "B", vec![]),
            item("c-item", "c-text", "C", vec![]),
            item("d", "d-text", "D", vec![]),
        ],
    );
    *body_mut(&mut root)? = vec![list(
        "outer",
        Some(3),
        vec![
            item("parent", "parent-text", "Parent", vec![nested, image]),
            item("following", "following-text", "Following", vec![]),
        ],
    )];
    let original = admit(&context, &root)?;
    let edit = OutdentListItems::capture(
        &original,
        &block("nested")?,
        &block("b")?,
        &block("c-item")?,
        Some(&block("suffix")?),
    )?
    .apply(&context, &original)?
    .ok_or("outdent")?;
    let mut actual = value(&context, edit.document())?;
    assert_eq!(reading_order(&actual), reading_order(&root));
    let items = &body_mut(&mut actual)?[0]["children"];
    assert_eq!(items.as_array().ok_or("outer")?.len(), 4);
    assert_eq!(items[0]["children"][1]["properties"]["breditor/start"], 5);
    assert_eq!(items[2]["children"][1]["properties"]["breditor/start"], 8);
    assert_eq!(items[2]["children"][2]["properties"]["breditor/image-id"], "image");
    check_inverse(&context, &original, &edit)
}

#[test]
fn splitting_a_rich_list_item_moves_media_to_the_right_item_and_maps_text() -> TestResult {
    let context = context()?;
    let original = wrapped(&context)?;
    let selected = RichSelection::try_new(&original, caret("p", 3, Affinity::After)?)?;
    let split = SplitListItem::capture(
        &original,
        &point("p", 1, Affinity::After)?,
        &block("new-item")?,
        &block("right")?,
        None,
    )?
    .apply(&context, &original)?
    .ok_or("split")?;
    assert_eq!(location(split.map_selection(&selected)?.selection().ok_or("map")?)?, ("right", 2));
    let mut root = value(&context, split.document())?;
    let items = &body_mut(&mut root)?[0]["children"];
    assert_eq!(items[0]["children"].as_array().ok_or("left")?.len(), 1);
    assert_eq!(items[1]["children"][1]["properties"]["breditor/image-id"], "image");
    check_inverse(&context, &original, &split)?;
    let join = JoinListItems::capture(
        split.document(),
        &block("list")?,
        &block("i0")?,
        &block("new-item")?,
    )?
    .apply(&context, split.document())?
    .ok_or("join")?;
    assert_eq!(bytes(&context, join.document())?, bytes(&context, &original)?);
    check_inverse(&context, split.document(), &join)
}

#[test]
fn joining_items_with_a_rich_left_tail_keeps_later_text_after_that_tail() -> TestResult {
    let context = context()?;
    let original = wrapped(&context)?;
    let selected = RichSelection::try_new(&original, caret("q", 1, Affinity::After)?)?;
    let join = JoinListItems::capture(&original, &block("list")?, &block("i0")?, &block("i1")?)?
        .apply(&context, &original)?
        .ok_or("join")?;
    assert_eq!(
        reading_order(&value(&context, join.document())?),
        reading_order(&value(&context, &original)?)
    );
    assert_eq!(join.map_selection(&selected)?.selection().ok_or("map")?.kind(), selected.kind());
    let mut root = value(&context, join.document())?;
    let first = &body_mut(&mut root)?[0]["children"][0]["children"];
    assert_eq!(first[0]["properties"]["breditor/block-id"], "p");
    assert_eq!(first[1]["properties"]["breditor/image-id"], "image");
    assert_eq!(first[2]["properties"]["breditor/block-id"], "q");
    check_inverse(&context, &original, &join)
}

#[test]
fn local_owner_history_restores_exact_list_structure_and_saved_split_caret() -> TestResult {
    let context = context()?;
    let original = wrapped(&context)?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        original.clone(),
        Some(caret("p", 3, Affinity::After)?),
        HistoryCapacity::default(),
    )?;
    let split = RichAction::SplitListItem(SplitListItem::capture(
        owner.state().document(),
        &point("p", 1, Affinity::After)?,
        &block("new-item")?,
        &block("right")?,
        None,
    )?);
    owner.dispatch(&owner.snapshot(), &[split], RichSelectionUpdate::Map)?;
    let after = bytes(&context, owner.state().document())?;
    assert_eq!(location(owner.state().selection().ok_or("selection")?)?, ("right", 2));
    owner.undo(&owner.snapshot())?;
    assert_eq!(bytes(&context, owner.state().document())?, bytes(&context, &original)?);
    assert_eq!(location(owner.state().selection().ok_or("selection")?)?, ("p", 3));
    owner.redo(&owner.snapshot())?;
    assert_eq!(bytes(&context, owner.state().document())?, after);
    assert_eq!(location(owner.state().selection().ok_or("selection")?)?, ("right", 2));
    Ok(())
}

fn grid(
    document: &RichDocument,
    anchor: (&str, &str),
    focus: (&str, &str),
) -> Result<RichSelection, Box<dyn std::error::Error>> {
    let cell = |row: &str, column: &str| -> Result<CellId, Box<dyn std::error::Error>> {
        Ok(CellId::new(TableId::try_new("t")?, RowId::try_new(row)?, ColumnId::try_new(column)?))
    };
    Ok(RichSelection::try_new(
        document,
        RichSelectionKind::Grid {
            anchor: cell(anchor.0, anchor.1)?,
            focus: cell(focus.0, focus.1)?,
        },
    )?)
}
fn stamp() -> Result<CausalStamp, Box<dyn std::error::Error>> {
    Ok(CausalStamp::new(10, ChangeId::new(ReplicaId::try_new(1)?, 0)))
}
fn merged_table(context: &EditorContext) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let mut root = fixture()?;
    let first_body = body_mut(&mut root)?.clone();
    let table = &mut root["children"][0];
    table["properties"]["breditor/columns"] =
        json!([{"id":"c0","width":120},{"id":"c1","width":180}]);
    let rows = (0..2)
        .map(|row| {
            let mut value = element(
                "table-row",
                &format!("row-{row}"),
                (0..2)
                    .map(|column| {
                        let body = if row == 0 && column == 0 {
                            first_body.clone()
                        } else {
                            vec![paragraph(&format!("body-{row}-{column}"), "original")]
                        };
                        let mut cell = element("table-cell", &format!("cell-{row}-{column}"), body);
                        cell["properties"]["breditor/column-id"] = format!("c{column}").into();
                        cell["properties"]["breditor/header"] = (row == 0).into();
                        cell
                    })
                    .collect(),
            );
            value["properties"]["breditor/row-id"] = format!("r{row}").into();
            value
        })
        .collect::<Vec<_>>();
    table["children"] = rows.into();
    let original = admit(context, &root)?;
    let edit = MergeTableCells::capture(
        &original,
        &grid(&original, ("r0", "c0"), ("r1", "c1"))?,
        MergeId::try_new("old-merge")?,
        stamp()?,
    )?
    .apply(context, &original)?
    .ok_or("merge")?;
    Ok(edit.into_parts().0)
}
fn text_draft(id: &str, text: &str) -> Result<RichBlockDraft, Box<dyn std::error::Error>> {
    let fragment: TextFragment = TextRun::try_new(text, FormatSet::default())?.into();
    Ok(RichBlockDraft::paragraph(&block(id)?, &fragment)?)
}
fn paste_draft() -> Result<TablePasteDraft, Box<dyn std::error::Error>> {
    let image = ImageDraft::try_new(
        &block("copy-image-block")?,
        &ImageBinding::new(
            ImageId::try_new("copy-image")?,
            AssetId::try_new("copied-asset")?,
            AssetGeneration::try_new("copied-generation")?,
            ImageAlt::decorative(),
            None,
        ),
        Some(text_draft("copy-caption", "Copied caption 🙂")?),
    )?;
    let list = RichListDraft::try_new(
        &block("copy-list")?,
        RichListKind::Ordered(OrderedListStart::try_new(4)?),
        vec![RichListItemDraft::try_new(
            &block("copy-item")?,
            text_draft("copy-00", "Copied rich body")?,
            vec![image.into()],
        )?],
    )?;
    Ok(TablePasteDraft::try_new(
        vec![
            vec![
                TableCellPasteDraft::try_new(vec![list.into()], Some(false))?,
                TableCellPasteDraft::try_new(vec![text_draft("copy-01", "Second")?], None)?,
            ],
            vec![
                TableCellPasteDraft::try_new(vec![text_draft("copy-10", "Third")?], Some(true))?,
                TableCellPasteDraft::try_new(vec![text_draft("copy-11", "Fourth")?], None)?,
            ],
        ],
        vec![TablePasteMerge::try_new(
            MergeId::try_new("pasted-merge")?,
            stamp()?,
            (0, 0),
            (0, 1),
        )?],
    )?)
}

#[test]
fn rich_multicell_paste_preserves_base_cell_ids_widths_headers_and_source_merge_partitions()
-> TestResult {
    let context = context()?;
    let original = merged_table(&context)?;
    let selected = grid(&original, ("r1", "c1"), ("r1", "c1"))?;
    let text = RichSelection::try_new(&original, caret("p", 3, Affinity::After)?)?;
    let paste = PasteTableCells::capture(&original, &selected, paste_draft()?)?
        .apply(&context, &original)?
        .ok_or("paste")?;
    let view = paste.document().table(&TableId::try_new("t")?)?.ok_or("view")?;
    assert_eq!(
        view.columns()
            .iter()
            .map(breditor_core::rich_content::RichColumn::width)
            .collect::<Vec<_>>(),
        vec![120, 180]
    );
    assert_eq!(view.geometry().active_regions(), &[MergeId::try_new("pasted-merge")?]);
    assert_eq!(view.geometry().cell(0, 0).ok_or("master")?.source_cells().len(), 2);
    assert_eq!(view.geometry().cell(1, 0).ok_or("master")?.source_cells().len(), 1);
    for (id, _) in original.cell_entries() {
        assert!(paste.document().cell_path(id).is_some());
    }
    assert_eq!(location(paste.map_selection(&text)?.selection().ok_or("map")?)?, ("copy-00", 0));
    assert!(paste.document().image(&ImageId::try_new("image")?)?.is_none());
    assert_eq!(
        paste.document().image(&ImageId::try_new("copy-image")?)?.ok_or("image")?.asset().as_str(),
        "copied-asset"
    );
    let root = value(&context, paste.document())?;
    let table = &root["children"][0];
    assert_eq!(table["properties"]["breditor/retracted-merges"], json!(["old-merge"]));
    assert_eq!(table["children"][0]["children"][0]["properties"]["breditor/header"], false);
    assert_eq!(table["children"][0]["children"][1]["properties"]["breditor/header"], true);
    assert_eq!(table["children"][1]["children"][0]["properties"]["breditor/header"], true);
    assert_eq!(table["children"][1]["children"][1]["properties"]["breditor/header"], false);
    check_inverse(&context, &original, &paste)
}

#[test]
fn clearing_a_merged_grid_retains_geometry_and_restores_media_text_and_caret_exactly() -> TestResult
{
    let context = context()?;
    let original = merged_table(&context)?;
    let grid = grid(&original, ("r1", "c1"), ("r1", "c1"))?;
    let before_selection = caret("p", 3, Affinity::After)?;
    let mut owner = RichLocalSession::try_new(
        context.clone(),
        original.clone(),
        Some(before_selection.clone()),
        HistoryCapacity::default(),
    )?;
    let action = RichAction::ClearTableCells(ClearTableCells::capture(
        &original,
        &grid,
        &[block("empty-0")?, block("empty-1")?, block("empty-2")?, block("empty-3")?],
    )?);
    owner.dispatch(&owner.snapshot(), &[action], RichSelectionUpdate::Map)?;
    let view = owner.state().document().table(&TableId::try_new("t")?)?.ok_or("table")?;
    assert_eq!(view.geometry().active_regions(), &[MergeId::try_new("old-merge")?]);
    assert_eq!(view.geometry().cell(0, 0).ok_or("master")?.source_cells().len(), 4);
    assert_eq!(location(owner.state().selection().ok_or("selection")?)?, ("empty-0", 0));
    assert!(owner.state().document().image(&ImageId::try_new("image")?)?.is_none());
    let after = bytes(&context, owner.state().document())?;
    owner.undo(&owner.snapshot())?;
    assert_eq!(bytes(&context, owner.state().document())?, bytes(&context, &original)?);
    assert_eq!(owner.state().selection().ok_or("selection")?.kind(), &before_selection);
    owner.redo(&owner.snapshot())?;
    assert_eq!(bytes(&context, owner.state().document())?, after);
    Ok(())
}

#[test]
fn paste_dimension_mismatch_is_rejected_instead_of_silently_cropping_the_fragment() -> TestResult {
    let context = context()?;
    let original = merged_table(&context)?;
    let selected = grid(&original, ("r0", "c0"), ("r1", "c1"))?;
    let wrong = TablePasteDraft::try_new(
        vec![vec![TableCellPasteDraft::try_new(vec![text_draft("one", "Only one")?], None)?]],
        vec![],
    )?;
    assert!(PasteTableCells::capture(&original, &selected, wrong).is_err());
    assert_eq!(original.cell_entries().len(), 4);
    Ok(())
}

#[test]
fn rich_fragment_insert_replace_and_remove_keep_explicit_identities_and_exact_inverse_bytes()
-> TestResult {
    let context = context()?;
    let original = admit(&context, &fixture()?)?;
    let list = RichListDraft::try_new(
        &block("fresh-list")?,
        RichListKind::Bullet,
        vec![RichListItemDraft::try_new(
            &block("fresh-item")?,
            text_draft("fresh-text", "Fresh 🙂")?,
            vec![],
        )?],
    )?;
    let position = RichFlowPosition::new(
        RichFlowParent::Cell(CellId::new(
            TableId::try_new("t")?,
            RowId::try_new("r")?,
            ColumnId::try_new("c")?,
        )),
        Some(block("image-block")?),
    );
    let inserted = InsertBlocks::capture(&original, &position, vec![list.into()])?
        .apply(&context, &original)?
        .ok_or("insert")?;
    assert!(inserted.document().block_path(&block("fresh-list")?).is_some());
    check_inverse(&context, &original, &inserted)?;
    let replacement = ReplaceBlocks::capture(
        &original,
        &block("image-block")?,
        &block("image-block")?,
        vec![text_draft("replacement", "Replaced")?],
    )?
    .apply(&context, &original)?
    .ok_or("replace")?;
    assert!(replacement.document().image(&ImageId::try_new("image")?)?.is_none());
    assert!(replacement.document().block_path(&block("replacement")?).is_some());
    check_inverse(&context, &original, &replacement)?;
    let removed =
        ReplaceBlocks::capture(&original, &block("image-block")?, &block("image-block")?, vec![])?
            .apply(&context, &original)?
            .ok_or("remove")?;
    check_inverse(&context, &original, &removed)
}
