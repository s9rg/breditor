#![cfg(feature = "experimental-rich-content")]
//! Functional whole-table/image, move, merge/split, header and caption workflows.

use breditor_core::{
    codec::DocumentJsonCodecV2,
    document::{Format, FormatSet, PropertyMap, TextFragment, TextRun},
    extension::{ExtensionLimits, ExtensionSet},
    identity::QualifiedName,
    position::{Affinity, TextOffset},
    rich_content::{
        AssetGeneration, AssetId, BlockId, CausalStamp, CellId, ChangeId, ColumnId, ImageAlt,
        ImageBinding, ImageDraft, ImageId, ImageSize, MergeConflictReason, MergeId, ReplicaId,
        RichBlockDraft, RichDocument, RichDraftError, RichFlowParent, RichFlowPosition,
        RichSelection, RichSelectionKind, RichSelectionMappingOutcome, RichTextPoint, RowId,
        TableCellDraft, TableColumnDraft, TableDraft, TableId, TableRowDraft,
        UploadCompletionMatch,
        actions::{
            DeleteImage, DeleteTable, InsertImage, InsertTable, MergeTableCells, MoveTableColumn,
            MoveTableRow, ReplaceImage, ResizeImage, RichAction, RichActionError, RichEdit,
            SetImageCaption, SetTableHeader, SplitTableCell, apply_batch,
        },
    },
    schema::{CompiledSchema, DocumentLimits, SchemaId, SchemaVersion},
    state::EditorContext,
};
use serde_json::{Value, json};

type TestResult = Result<(), Box<dyn std::error::Error>>;

fn schema() -> Result<CompiledSchema, Box<dyn std::error::Error>> {
    Ok(CompiledSchema::try_compile_rich_content_profile(
        SchemaId::new(QualifiedName::try_new("example/rich-features")?, SchemaVersion::try_new(1)?),
        &ExtensionSet::try_new(vec![], ExtensionLimits::default())?,
    )?)
}
fn context() -> Result<EditorContext, Box<dyn std::error::Error>> {
    Ok(EditorContext::new(schema()?, DocumentLimits::default()))
}
fn admit(root: &Value) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let schema = schema()?;
    let value = json!({"format":"breditor/document","formatVersion":2,
        "schema":{"name":schema.id().name().as_str(),"version":1},
        "schemaFingerprint":schema.fingerprint().to_string(),"root":root});
    let document = DocumentJsonCodecV2::new(schema.clone()).decode(&value.to_string())?;
    Ok(RichDocument::try_admit(&schema, document, &DocumentLimits::default())?)
}
fn initial() -> Result<RichDocument, Box<dyn std::error::Error>> {
    admit(&json!({"kind":"element","type":"breditor/document","entityId":null,
        "properties":{"breditor/document-id":"room"},"children":[
            {"kind":"element","type":"breditor/paragraph","entityId":null,
             "properties":{"breditor/block-id":"intro"},"children":[
                 {"kind":"text","text":"Intro 🙂","formats":[]}]}]}))
}
fn bytes(document: &RichDocument) -> Result<String, Box<dyn std::error::Error>> {
    Ok(DocumentJsonCodecV2::new(schema()?).encode(document.document())?)
}
fn root_value(document: &RichDocument) -> Result<Value, Box<dyn std::error::Error>> {
    Ok(serde_json::from_str::<Value>(&bytes(document)?)?["root"].clone())
}
fn text(value: &str) -> Result<TextFragment, Box<dyn std::error::Error>> {
    if value.is_empty() {
        return Ok(TextFragment::empty());
    }
    Ok(TextRun::try_new(value, FormatSet::default())?.into())
}
fn paragraph(id: &str, value: &str) -> Result<RichBlockDraft, Box<dyn std::error::Error>> {
    Ok(RichBlockDraft::paragraph(&BlockId::try_new(id)?, &text(value)?)?)
}
fn binding() -> Result<ImageBinding, Box<dyn std::error::Error>> {
    Ok(ImageBinding::new(
        ImageId::try_new("image")?,
        AssetId::try_new("asset-original")?,
        AssetGeneration::try_new("generation-original")?,
        ImageAlt::try_description("A diagram".into())?,
        Some(ImageSize::try_new(320, 240)?),
    ))
}
fn image_draft() -> Result<ImageDraft, Box<dyn std::error::Error>> {
    Ok(ImageDraft::try_new(
        &BlockId::try_new("image-block")?,
        &binding()?,
        Some(paragraph("caption", "Caption e\u{301} 🙂")?),
    )?)
}
fn table_draft(rows: usize, columns: usize) -> Result<TableDraft, Box<dyn std::error::Error>> {
    let strong = FormatSet::try_from_formats(vec![Format::new(
        QualifiedName::try_new("breditor/strong")?,
        PropertyMap::default(),
    )])?;
    let column_drafts = (0..columns)
        .map(|column| {
            Ok(TableColumnDraft::try_new(
                ColumnId::try_new(format!("c{column}"))?,
                120 + u32::try_from(column)? * 10,
            )?)
        })
        .collect::<Result<Vec<_>, Box<dyn std::error::Error>>>()?;
    let row_drafts = (0..rows)
        .map(|row| {
            let cells = (0..columns)
                .map(|column| {
                    let value: TextFragment =
                        TextRun::try_new(format!("r{row}c{column} 🙂"), strong.clone())?.into();
                    Ok(TableCellDraft::try_new(
                        &BlockId::try_new(format!("cell-{row}-{column}"))?,
                        ColumnId::try_new(format!("c{column}"))?,
                        false,
                        vec![RichBlockDraft::paragraph(
                            &BlockId::try_new(format!("body-{row}-{column}"))?,
                            &value,
                        )?],
                    )?)
                })
                .collect::<Result<Vec<_>, Box<dyn std::error::Error>>>()?;
            Ok(TableRowDraft::try_new(
                &BlockId::try_new(format!("row-{row}"))?,
                RowId::try_new(format!("r{row}"))?,
                cells,
            )?)
        })
        .collect::<Result<Vec<_>, Box<dyn std::error::Error>>>()?;
    Ok(TableDraft::try_new(
        &BlockId::try_new("table-block")?,
        TableId::try_new("table")?,
        column_drafts,
        row_drafts,
    )?)
}
fn table_document(rows: usize, columns: usize) -> Result<RichDocument, Box<dyn std::error::Error>> {
    let initial = initial()?;
    let edit = InsertTable::capture(
        &initial,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        table_draft(rows, columns)?,
    )?
    .apply(&context()?, &initial)?
    .ok_or("insert table")?;
    Ok(edit.into_parts().0)
}
fn cell(row: &str, column: &str) -> Result<CellId, Box<dyn std::error::Error>> {
    Ok(CellId::new(TableId::try_new("table")?, RowId::try_new(row)?, ColumnId::try_new(column)?))
}
fn grid(
    document: &RichDocument,
    first: (&str, &str),
    last: (&str, &str),
) -> Result<RichSelection, Box<dyn std::error::Error>> {
    Ok(RichSelection::try_new(
        document,
        RichSelectionKind::Grid { anchor: cell(first.0, first.1)?, focus: cell(last.0, last.1)? },
    )?)
}
fn stamp(counter: u64) -> Result<CausalStamp, Box<dyn std::error::Error>> {
    Ok(CausalStamp::new(
        u64::MAX,
        ChangeId::new(ReplicaId::try_new(9_007_199_254_740_993)?, counter),
    ))
}
fn check_inverse(edit: &RichEdit, original: &RichDocument) -> TestResult {
    let restored = edit.inverse().apply(&context()?, edit.document())?.ok_or("undo")?;
    assert_eq!(bytes(restored.document())?, bytes(original)?);
    let redone = restored.inverse().apply(&context()?, restored.document())?.ok_or("redo")?;
    assert_eq!(bytes(redone.document())?, bytes(edit.document())?);
    Ok(())
}

#[test]
fn whole_table_creation_and_removal_restore_all_format_width_header_and_identity_bytes()
-> TestResult {
    let original = initial()?;
    let edit = InsertTable::capture(
        &original,
        &RichFlowPosition::new(RichFlowParent::Document, Some(BlockId::try_new("intro")?)),
        table_draft(2, 2)?,
    )?
    .apply(&context()?, &original)?
    .ok_or("table edit")?;
    let table = TableId::try_new("table")?;
    assert_eq!(edit.document().table_path(&table).ok_or("path")?.to_vec(), vec![0]);
    assert_eq!(edit.document().cell_entries().len(), 4);
    let value = root_value(edit.document())?;
    assert_eq!(
        value["children"][0]["children"][1]["children"][1]["children"][0]["children"][0]["formats"]
            [0]["type"],
        "breditor/strong"
    );
    check_inverse(&edit, &original)?;
    let removed = DeleteTable::capture(edit.document(), &table, None)?
        .apply(&context()?, edit.document())?
        .ok_or("delete table")?;
    assert_eq!(bytes(removed.document())?, bytes(&original)?);
    check_inverse(&removed, edit.document())
}

#[test]
fn whole_table_can_live_in_a_list_but_is_not_admitted_inside_a_cell() -> TestResult {
    let original = initial()?;
    let mut root = root_value(&original)?;
    let intro = root["children"][0].clone();
    root["children"] = json!([{"kind":"element","type":"breditor/bullet-list","entityId":null,
        "properties":{"breditor/block-id":"list"},"children":[
            {"kind":"element","type":"breditor/list-item","entityId":null,
             "properties":{"breditor/block-id":"item"},"children":[intro]}]}]);
    let in_list = admit(&root)?;
    let action = InsertTable::capture(
        &in_list,
        &RichFlowPosition::new(RichFlowParent::ListItem(BlockId::try_new("item")?), None),
        table_draft(1, 1)?,
    )?;
    let inserted = action.apply(&context()?, &in_list)?.ok_or("table in list")?;
    assert_eq!(
        inserted.document().table_path(&TableId::try_new("table")?).ok_or("path")?.to_vec(),
        vec![0, 0, 1]
    );
    check_inverse(&inserted, &in_list)?;
    let nested_draft = TableDraft::try_new(
        &BlockId::try_new("nested-table-block")?,
        TableId::try_new("nested-table")?,
        vec![TableColumnDraft::try_new(ColumnId::try_new("nested-column")?, 120)?],
        vec![TableRowDraft::try_new(
            &BlockId::try_new("nested-row-block")?,
            RowId::try_new("nested-row")?,
            vec![TableCellDraft::try_new(
                &BlockId::try_new("nested-cell")?,
                ColumnId::try_new("nested-column")?,
                false,
                vec![paragraph("nested-body", "nested")?],
            )?],
        )?],
    )?;
    let nested = InsertTable::capture(
        inserted.document(),
        &RichFlowPosition::new(RichFlowParent::Cell(cell("r0", "c0")?), None),
        nested_draft,
    )?;
    assert!(nested.apply(&context()?, inserted.document()).is_err());
    Ok(())
}

#[test]
fn axis_moves_keep_all_cell_identities_widths_and_directional_text_positions() -> TestResult {
    let original = table_document(3, 3)?;
    let point =
        RichTextPoint::new(BlockId::try_new("body-1-1")?, TextOffset::try_new(4)?, Affinity::After);
    let selected = RichSelection::try_new(
        &original,
        RichSelectionKind::TextRange { anchor: point.clone(), focus: point },
    )?;
    for action in [
        RichAction::MoveTableRow(MoveTableRow::capture(
            &original,
            &TableId::try_new("table")?,
            &RowId::try_new("r1")?,
            Some(&RowId::try_new("r0")?),
        )?),
        RichAction::MoveTableColumn(MoveTableColumn::capture(
            &original,
            &TableId::try_new("table")?,
            &ColumnId::try_new("c1")?,
            None,
        )?),
    ] {
        let edit = action.apply(&context()?, &original)?.ok_or("move")?;
        assert_eq!(edit.document().cell_entries().len(), 9);
        for (id, path) in original.cell_entries() {
            let current = edit.document().cell_path(id).ok_or("stable cell")?;
            assert_eq!(
                edit.document().document().node_at(current)?,
                original.document().node_at(path)?
            );
        }
        let mapped = edit.map_selection(&selected)?;
        assert_eq!(mapped.outcome(), RichSelectionMappingOutcome::Preserved);
        assert_eq!(mapped.selection().ok_or("mapped")?.kind(), selected.kind());
        check_inverse(&edit, &original)?;
    }
    let moved = MoveTableColumn::capture(
        &original,
        &TableId::try_new("table")?,
        &ColumnId::try_new("c1")?,
        None,
    )?
    .apply(&context()?, &original)?
    .ok_or("move column")?;
    let view = moved.document().table(&TableId::try_new("table")?)?.ok_or("view")?;
    assert_eq!(
        view.columns()
            .iter()
            .map(|column| (column.id().as_str(), column.width()))
            .collect::<Vec<_>>(),
        vec![("c0", 120), ("c2", 140), ("c1", 130)]
    );
    Ok(())
}

#[test]
fn merge_split_and_header_changes_preserve_every_original_body_and_exact_u64_stamp() -> TestResult {
    let original = table_document(2, 2)?;
    let selection = grid(&original, ("r1", "c1"), ("r0", "c0"))?;
    let merged = MergeTableCells::capture(
        &original,
        &selection,
        MergeId::try_new("merge")?,
        stamp(u64::MAX)?,
    )?
    .apply(&context()?, &original)?
    .ok_or("merge")?;
    let view = merged.document().table(&TableId::try_new("table")?)?.ok_or("view")?;
    assert_eq!(view.geometry().cell(0, 0).ok_or("master")?.source_cells().len(), 4);
    for (id, path) in original.cell_entries() {
        assert_eq!(
            merged.document().document().node_at(merged.document().cell_path(id).ok_or("cell")?)?,
            original.document().node_at(path)?
        );
    }
    let value = root_value(merged.document())?;
    assert_eq!(
        value["children"][1]["properties"]["breditor/merges"][0]["lamport"],
        u64::MAX.to_string()
    );
    assert_eq!(
        value["children"][1]["properties"]["breditor/merges"][0]["counter"],
        u64::MAX.to_string()
    );
    check_inverse(&merged, &original)?;
    let selected = grid(merged.document(), ("r1", "c1"), ("r1", "c1"))?;
    let header = SetTableHeader::capture(merged.document(), &selected, true)?
        .apply(&context()?, merged.document())?
        .ok_or("header")?;
    let value = root_value(header.document())?;
    for row in value["children"][1]["children"].as_array().ok_or("rows")? {
        for cell in row["children"].as_array().ok_or("cells")? {
            assert_eq!(cell["properties"]["breditor/header"], true);
        }
    }
    check_inverse(&header, merged.document())?;
    let split = SplitTableCell::capture(merged.document(), &cell("r1", "c1")?)?
        .apply(&context()?, merged.document())?
        .ok_or("split")?;
    let view = split.document().table(&TableId::try_new("table")?)?.ok_or("view")?;
    assert!(view.geometry().active_regions().is_empty());
    assert!(
        view.geometry().cells().iter().all(breditor_core::rich_content::ResolvedCell::is_master)
    );
    check_inverse(&split, merged.document())
}

#[test]
fn split_retracts_known_losing_overlaps_instead_of_reviving_them() -> TestResult {
    let original = table_document(2, 2)?;
    let selection = grid(&original, ("r0", "c0"), ("r1", "c1"))?;
    let merged =
        MergeTableCells::capture(&original, &selection, MergeId::try_new("a")?, stamp(0)?)?
            .apply(&context()?, &original)?
            .ok_or("merge")?;
    let mut root = root_value(merged.document())?;
    let mut later = root["children"][1]["properties"]["breditor/merges"][0].clone();
    later["id"] = "z".into();
    later["counter"] = "1".into();
    root["children"][1]["properties"]["breditor/merges"] =
        json!([root["children"][1]["properties"]["breditor/merges"][0], later]);
    let conflicted = admit(&root)?;
    let split = SplitTableCell::capture(&conflicted, &cell("r1", "c1")?)?
        .apply(&context()?, &conflicted)?
        .ok_or("split")?;
    assert!(
        split
            .document()
            .table(&TableId::try_new("table")?)?
            .ok_or("table")?
            .geometry()
            .active_regions()
            .is_empty()
    );
    let root = root_value(split.document())?;
    assert_eq!(root["children"][1]["properties"]["breditor/retracted-merges"], json!(["a", "z"]));
    check_inverse(&split, &conflicted)
}

#[test]
fn moving_original_merge_members_deactivates_intent_without_flattening_bodies() -> TestResult {
    let original = table_document(3, 2)?;
    let selection = grid(&original, ("r0", "c0"), ("r1", "c1"))?;
    let merged =
        MergeTableCells::capture(&original, &selection, MergeId::try_new("merge")?, stamp(0)?)?
            .apply(&context()?, &original)?
            .ok_or("merge")?;
    let moved = MoveTableRow::capture(
        merged.document(),
        &TableId::try_new("table")?,
        &RowId::try_new("r2")?,
        Some(&RowId::try_new("r1")?),
    )?
    .apply(&context()?, merged.document())?
    .ok_or("move")?;
    let view = moved.document().table(&TableId::try_new("table")?)?.ok_or("table")?;
    assert!(view.geometry().active_regions().is_empty());
    assert_eq!(view.geometry().conflicts()[0].reason(), MergeConflictReason::OldAxisMovedInside);
    assert_eq!(moved.document().cell_entries().len(), 6);
    check_inverse(&moved, merged.document())
}

#[test]
fn unchanged_order_header_or_unmerged_split_does_not_create_an_edit() -> TestResult {
    let original = table_document(2, 2)?;
    let selection = grid(&original, ("r0", "c0"), ("r1", "c1"))?;
    let actions = [
        RichAction::MoveTableRow(MoveTableRow::capture(
            &original,
            &TableId::try_new("table")?,
            &RowId::try_new("r0")?,
            Some(&RowId::try_new("r1")?),
        )?),
        RichAction::MoveTableColumn(MoveTableColumn::capture(
            &original,
            &TableId::try_new("table")?,
            &ColumnId::try_new("c1")?,
            Some(&ColumnId::try_new("c1")?),
        )?),
        RichAction::SetTableHeader(SetTableHeader::capture(&original, &selection, false)?),
        RichAction::SplitTableCell(SplitTableCell::capture(&original, &cell("r0", "c0")?)?),
    ];
    for action in actions {
        assert!(action.apply(&context()?, &original)?.is_none());
    }
    Ok(())
}

#[test]
fn image_creation_replacement_caption_removal_and_deletion_preserve_stable_identity() -> TestResult
{
    let original = initial()?;
    let inserted = InsertImage::capture(
        &original,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        image_draft()?,
    )?
    .apply(&context()?, &original)?
    .ok_or("insert")?;
    let image = ImageId::try_new("image")?;
    check_inverse(&inserted, &original)?;
    let selected = RichSelection::try_new(
        inserted.document(),
        RichSelectionKind::Node(BlockId::try_new("image-block")?),
    )?;
    let old_token = inserted.document().image(&image)?.ok_or("binding")?.upload_token();
    let replaced = ReplaceImage::capture(
        inserted.document(),
        &image,
        AssetId::try_new("asset-new")?,
        AssetGeneration::try_new("generation-new")?,
    )?
    .apply(&context()?, inserted.document())?
    .ok_or("replace")?;
    let current = replaced.document().image(&image)?.ok_or("binding")?;
    assert_eq!(current.alt(), binding()?.alt());
    assert_eq!(current.size(), binding()?.size());
    assert_eq!(old_token.classify(Some(&current)), UploadCompletionMatch::StaleOrDeleted);
    assert!(replaced.document().block_path(&BlockId::try_new("caption")?).is_some());
    assert_eq!(
        replaced.map_selection(&selected)?.outcome(),
        RichSelectionMappingOutcome::Preserved
    );
    check_inverse(&replaced, inserted.document())?;
    let caption = SetImageCaption::capture(
        replaced.document(),
        &image,
        Some(paragraph("caption-new", "New caption 🙂")?),
    )?
    .apply(&context()?, replaced.document())?
    .ok_or("caption")?;
    assert!(caption.document().block_path(&BlockId::try_new("caption")?).is_none());
    assert!(caption.document().block_path(&BlockId::try_new("caption-new")?).is_some());
    check_inverse(&caption, replaced.document())?;
    let clear = SetImageCaption::capture(caption.document(), &image, None)?
        .apply(&context()?, caption.document())?
        .ok_or("clear caption")?;
    check_inverse(&clear, caption.document())?;
    let removed = DeleteImage::capture(clear.document(), &image, None)?
        .apply(&context()?, clear.document())?
        .ok_or("remove")?;
    assert!(removed.document().image(&image)?.is_none());
    assert_eq!(old_token.classify(None), UploadCompletionMatch::StaleOrDeleted);
    let selection_after_replace = replaced.map_selection(&selected)?;
    let selection_after_caption =
        caption.map_selection(selection_after_replace.selection().ok_or("select")?)?;
    let selection_after_clear =
        clear.map_selection(selection_after_caption.selection().ok_or("select")?)?;
    assert!(
        removed
            .map_selection(selection_after_clear.selection().ok_or("select")?)?
            .selection()
            .is_none()
    );
    assert_eq!(bytes(removed.document())?, bytes(&original)?);
    check_inverse(&removed, clear.document())
}

#[test]
fn image_inside_a_cell_retains_caption_formats_and_can_be_removed_as_one_edit() -> TestResult {
    let original = table_document(1, 1)?;
    let inserted = InsertImage::capture(
        &original,
        &RichFlowPosition::new(RichFlowParent::Cell(cell("r0", "c0")?), None),
        image_draft()?,
    )?
    .apply(&context()?, &original)?
    .ok_or("insert")?;
    assert_eq!(
        inserted.document().image_path(&ImageId::try_new("image")?).ok_or("path")?.to_vec(),
        vec![1, 0, 0, 1]
    );
    check_inverse(&inserted, &original)?;
    let removed = DeleteImage::capture(inserted.document(), &ImageId::try_new("image")?, None)?
        .apply(&context()?, inserted.document())?
        .ok_or("remove")?;
    assert_eq!(bytes(removed.document())?, bytes(&original)?);
    check_inverse(&removed, inserted.document())
}

#[test]
fn deleting_the_only_flow_child_requires_an_explicit_owned_replacement() -> TestResult {
    let initial = initial()?;
    let inserted = InsertImage::capture(
        &initial,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        image_draft()?,
    )?
    .apply(&context()?, &initial)?
    .ok_or("insert")?;
    let mut root = root_value(inserted.document())?;
    root["children"] = json!([root["children"][1]]);
    let original = admit(&root)?;
    assert!(matches!(
        DeleteImage::capture(&original, &ImageId::try_new("image")?, None),
        Err(RichActionError::FlowWouldBeEmpty)
    ));
    let removed = DeleteImage::capture(
        &original,
        &ImageId::try_new("image")?,
        Some(paragraph("replacement", "")?),
    )?
    .apply(&context()?, &original)?
    .ok_or("replace")?;
    assert!(removed.document().block_path(&BlockId::try_new("replacement")?).is_some());
    check_inverse(&removed, &original)
}

#[test]
fn late_table_or_parent_changes_reject_old_actions_without_publishing_partial_work() -> TestResult {
    let original = table_document(2, 2)?;
    let selection = grid(&original, ("r0", "c0"), ("r1", "c1"))?;
    let merge =
        MergeTableCells::capture(&original, &selection, MergeId::try_new("merge")?, stamp(0)?)?;
    let deletion = DeleteTable::capture(&original, &TableId::try_new("table")?, None)?;
    let later = SetTableHeader::capture(&original, &selection, true)?
        .apply(&context()?, &original)?
        .ok_or("header")?;
    assert!(matches!(
        merge.apply(&context()?, later.document()),
        Err(RichActionError::StaleTarget)
    ));
    assert!(matches!(
        deletion.apply(&context()?, later.document()),
        Err(RichActionError::StaleTarget)
    ));
    assert!(
        MergeTableCells::capture(
            &original,
            &RichSelection::try_new(
                &original,
                RichSelectionKind::Node(BlockId::try_new("intro")?)
            )?,
            MergeId::try_new("merge")?,
            stamp(0)?
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn image_drafts_and_asset_replacement_require_checked_caption_and_generation_contracts()
-> TestResult {
    let heading =
        RichBlockDraft::heading(&BlockId::try_new("heading")?, 2, &text("not a caption")?)?;
    assert!(matches!(
        ImageDraft::try_new(&BlockId::try_new("image-block")?, &binding()?, Some(heading)),
        Err(RichDraftError::Caption)
    ));
    let original = initial()?;
    let inserted = InsertImage::capture(
        &original,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        image_draft()?,
    )?
    .apply(&context()?, &original)?
    .ok_or("insert")?;
    assert!(
        ReplaceImage::capture(
            inserted.document(),
            &ImageId::try_new("image")?,
            AssetId::try_new("different")?,
            AssetGeneration::try_new("generation-original")?
        )
        .is_err()
    );
    Ok(())
}

#[test]
fn mixed_table_image_group_restores_exact_documents_at_undo_and_redo() -> TestResult {
    let original = initial()?;
    let mut candidate = original.clone();
    let mut actions = Vec::new();
    let table = RichAction::InsertTable(InsertTable::capture(
        &candidate,
        &RichFlowPosition::new(RichFlowParent::Document, None),
        table_draft(2, 2)?,
    )?);
    candidate = table.apply(&context()?, &candidate)?.ok_or("table")?.into_parts().0;
    actions.push(table);
    let image = RichAction::InsertImage(InsertImage::capture(
        &candidate,
        &RichFlowPosition::new(RichFlowParent::Cell(cell("r1", "c1")?), None),
        image_draft()?,
    )?);
    candidate = image.apply(&context()?, &candidate)?.ok_or("image")?.into_parts().0;
    actions.push(image);
    let selection = grid(&candidate, ("r0", "c0"), ("r1", "c1"))?;
    let merge = RichAction::MergeTableCells(MergeTableCells::capture(
        &candidate,
        &selection,
        MergeId::try_new("merge")?,
        stamp(0)?,
    )?);
    candidate = merge.apply(&context()?, &candidate)?.ok_or("merge")?.into_parts().0;
    actions.push(merge);
    let selected = grid(&candidate, ("r1", "c1"), ("r1", "c1"))?;
    let header = RichAction::SetTableHeader(SetTableHeader::capture(&candidate, &selected, true)?);
    candidate = header.apply(&context()?, &candidate)?.ok_or("header")?.into_parts().0;
    actions.push(header);
    let replace = RichAction::ReplaceImage(ReplaceImage::capture(
        &candidate,
        &ImageId::try_new("image")?,
        AssetId::try_new("asset-new")?,
        AssetGeneration::try_new("generation-new")?,
    )?);
    candidate = replace.apply(&context()?, &candidate)?.ok_or("replace")?.into_parts().0;
    actions.push(replace);
    actions.push(RichAction::ResizeImage(ResizeImage::capture(
        &candidate,
        &ImageId::try_new("image")?,
        Some(ImageSize::try_new(640, 480)?),
    )?));
    let edit = apply_batch(&context()?, &original, &actions)?.ok_or("group")?;
    assert_eq!(edit.inverse().len(), 6);
    let undone = apply_batch(&context()?, edit.document(), edit.inverse())?.ok_or("undo")?;
    assert_eq!(bytes(undone.document())?, bytes(&original)?);
    let redone = apply_batch(&context()?, undone.document(), undone.inverse())?.ok_or("redo")?;
    assert_eq!(bytes(redone.document())?, bytes(edit.document())?);
    Ok(())
}
