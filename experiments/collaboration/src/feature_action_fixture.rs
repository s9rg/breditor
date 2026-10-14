//! Real core table/image feature actions in native/Wasm, with exact local inverse checks.

use crate::{Error, rich_ast_fixture, table_axis_fixture::admitted};
use breditor_core::{
    document::{FormatSet, TextFragment, TextRun},
    rich_content::{
        AssetGeneration, AssetId, BlockId, CausalStamp, CellId, ChangeId, ColumnId, ImageAlt,
        ImageBinding, ImageDraft, ImageId, MergeId, ReplicaId, RichBlockDraft, RichDocument,
        RichFlowParent, RichFlowPosition, RichSelection, RichSelectionKind, RowId, TableCellDraft,
        TableColumnDraft, TableDraft, TableId, TableRowDraft,
        actions::{
            DeleteImage, DeleteTable, InsertImage, InsertTable, MergeTableCells, MoveTableColumn,
            MoveTableRow, ReplaceImage, RichAction, SetImageCaption, SetTableHeader,
            SplitTableCell,
        },
    },
};
use serde_json::json;

fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich feature action fixture")
}

fn paragraph(id: &str, text: &str) -> Result<RichBlockDraft, Error> {
    let fragment: TextFragment =
        TextRun::try_new(text, FormatSet::default()).map_err(contract)?.into();
    RichBlockDraft::paragraph(&BlockId::try_new(id).map_err(contract)?, &fragment).map_err(contract)
}

fn table_draft() -> Result<TableDraft, Error> {
    let column = ColumnId::try_new("fresh-column").map_err(contract)?;
    let cell = TableCellDraft::try_new(
        &BlockId::try_new("fresh-cell").map_err(contract)?,
        column.clone(),
        false,
        vec![paragraph("fresh-cell-body", "Fresh 🙂 cell")?],
    )
    .map_err(contract)?;
    TableDraft::try_new(
        &BlockId::try_new("fresh-table-block").map_err(contract)?,
        TableId::try_new("fresh-table").map_err(contract)?,
        vec![TableColumnDraft::try_new(column, 180).map_err(contract)?],
        vec![
            TableRowDraft::try_new(
                &BlockId::try_new("fresh-row-block").map_err(contract)?,
                RowId::try_new("fresh-row").map_err(contract)?,
                vec![cell],
            )
            .map_err(contract)?,
        ],
    )
    .map_err(contract)
}

fn image_draft() -> Result<ImageDraft, Error> {
    let binding = ImageBinding::new(
        ImageId::try_new("fresh-image").map_err(contract)?,
        AssetId::try_new("fresh-asset").map_err(contract)?,
        AssetGeneration::try_new("fresh-generation").map_err(contract)?,
        ImageAlt::try_description("Fresh diagram".into()).map_err(contract)?,
        None,
    );
    ImageDraft::try_new(
        &BlockId::try_new("fresh-image-block").map_err(contract)?,
        &binding,
        Some(paragraph("fresh-caption", "Fresh caption e\u{301}")?),
    )
    .map_err(contract)
}

fn table_actions(original: &RichDocument) -> Result<Vec<(&'static str, RichAction)>, Error> {
    let table = TableId::try_new("table-one").map_err(contract)?;
    let first = CellId::new(
        table.clone(),
        RowId::try_new("r0").map_err(contract)?,
        ColumnId::try_new("c0").map_err(contract)?,
    );
    let last = CellId::new(
        table.clone(),
        RowId::try_new("r1").map_err(contract)?,
        ColumnId::try_new("c1").map_err(contract)?,
    );
    let selection = RichSelection::try_new(
        original,
        RichSelectionKind::Grid { anchor: last.clone(), focus: first },
    )
    .map_err(contract)?;
    Ok(vec![
        (
            "move_row",
            RichAction::MoveTableRow(
                MoveTableRow::capture(
                    original,
                    &table,
                    &RowId::try_new("r1").map_err(contract)?,
                    Some(&RowId::try_new("r0").map_err(contract)?),
                )
                .map_err(contract)?,
            ),
        ),
        (
            "move_column",
            RichAction::MoveTableColumn(
                MoveTableColumn::capture(
                    original,
                    &table,
                    &ColumnId::try_new("c1").map_err(contract)?,
                    Some(&ColumnId::try_new("c0").map_err(contract)?),
                )
                .map_err(contract)?,
            ),
        ),
        (
            "merge",
            RichAction::MergeTableCells(
                MergeTableCells::capture(
                    original,
                    &selection,
                    MergeId::try_new("merge-new").map_err(contract)?,
                    CausalStamp::new(
                        u64::MAX,
                        ChangeId::new(
                            ReplicaId::try_new(9_007_199_254_740_993).map_err(contract)?,
                            u64::MAX,
                        ),
                    ),
                )
                .map_err(contract)?,
            ),
        ),
        (
            "split",
            RichAction::SplitTableCell(SplitTableCell::capture(original, &last).map_err(contract)?),
        ),
        (
            "header",
            RichAction::SetTableHeader(
                SetTableHeader::capture(original, &selection, true).map_err(contract)?,
            ),
        ),
    ])
}

fn flow_actions(original: &RichDocument) -> Result<Vec<(&'static str, RichAction)>, Error> {
    Ok(vec![
        (
            "insert_table",
            RichAction::InsertTable(
                InsertTable::capture(
                    original,
                    &RichFlowPosition::new(RichFlowParent::Document, None),
                    table_draft()?,
                )
                .map_err(contract)?,
            ),
        ),
        (
            "delete_table",
            RichAction::DeleteTable(
                DeleteTable::capture(
                    original,
                    &TableId::try_new("table-one").map_err(contract)?,
                    None,
                )
                .map_err(contract)?,
            ),
        ),
        (
            "insert_image",
            RichAction::InsertImage(
                InsertImage::capture(
                    original,
                    &RichFlowPosition::new(
                        RichFlowParent::Cell(CellId::new(
                            TableId::try_new("table-one").map_err(contract)?,
                            RowId::try_new("r0").map_err(contract)?,
                            ColumnId::try_new("c0").map_err(contract)?,
                        )),
                        None,
                    ),
                    image_draft()?,
                )
                .map_err(contract)?,
            ),
        ),
        (
            "delete_image",
            RichAction::DeleteImage(
                DeleteImage::capture(
                    original,
                    &ImageId::try_new("covered-image").map_err(contract)?,
                    None,
                )
                .map_err(contract)?,
            ),
        ),
    ])
}

fn image_actions(original: &RichDocument) -> Result<Vec<(&'static str, RichAction)>, Error> {
    let image = ImageId::try_new("covered-image").map_err(contract)?;
    Ok(vec![
        (
            "replace_image",
            RichAction::ReplaceImage(
                ReplaceImage::capture(
                    original,
                    &image,
                    AssetId::try_new("asset-new").map_err(contract)?,
                    AssetGeneration::try_new("generation-new").map_err(contract)?,
                )
                .map_err(contract)?,
            ),
        ),
        (
            "caption",
            RichAction::SetImageCaption(
                SetImageCaption::capture(
                    original,
                    &image,
                    Some(paragraph("caption-new", "New caption 🙂")?),
                )
                .map_err(contract)?,
            ),
        ),
    ])
}

/// Exercise all new table/image actions against the native golden rich tree.
///
/// Every case runs the actual admitted Rust action, inverse and redo; the returned
/// derived views use the core geometry and image directory, not a JavaScript model.
///
/// # Errors
/// Rejects malformed inputs, missing scenario IDs, stale actions or inverse failures.
pub fn exercise(input: &str) -> Result<String, Error> {
    let (context, codec, original) = admitted(input)?;
    let initial = codec.encode(original.document()).map_err(contract)?;
    let mut actions = table_actions(&original)?;
    actions.extend(flow_actions(&original)?);
    actions.extend(image_actions(&original)?);
    let mut cases = Vec::new();
    for (name, action) in actions {
        let changed = action
            .apply(&context, &original)
            .map_err(contract)?
            .ok_or(Error::Contract("feature scenario edit"))?;
        let undone = changed
            .inverse()
            .apply(&context, changed.document())
            .map_err(contract)?
            .ok_or(Error::Contract("feature scenario undo"))?;
        let redone = undone
            .inverse()
            .apply(&context, undone.document())
            .map_err(contract)?
            .ok_or(Error::Contract("feature scenario redo"))?;
        let changed_bytes = codec.encode(changed.document().document()).map_err(contract)?;
        cases.push(json!({"name":name,"changed":changed_bytes,
            "view":serde_json::from_str::<serde_json::Value>(&rich_ast_fixture::admit(&changed_bytes)?).map_err(contract)?,
            "undone":codec.encode(undone.document().document()).map_err(contract)?,
            "redone":codec.encode(redone.document().document()).map_err(contract)?}));
    }
    Ok(json!({"initial":initial,"cases":cases}).to_string())
}
