//! Matching native/Wasm rich multicell paste/clear and retained merge source bodies.

use crate::{
    Error, rich_ast_fixture,
    table_axis_fixture::{admitted, selection_json},
};
use breditor_core::{
    block::OrderedListStart,
    document::{FormatSet, TextFragment, TextRun},
    position::{Affinity, TextOffset},
    rich_content::{
        AssetGeneration, AssetId, BlockId, CausalStamp, CellId, ChangeId, ColumnId, ImageAlt,
        ImageBinding, ImageDraft, ImageId, MergeId, ReplicaId, RichBlockDraft, RichDocument,
        RichListDraft, RichListItemDraft, RichListKind, RichSelection, RichSelectionKind,
        RichTextPoint, RowId, TableCellPasteDraft, TableId, TablePasteDraft, TablePasteMerge,
        actions::{ClearTableCells, PasteTableCells, RichAction},
    },
};
use serde_json::{Value, json};

fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich paste fixture")
}
fn id(value: &str) -> Result<BlockId, Error> {
    BlockId::try_new(value).map_err(contract)
}
fn paragraph(block: &str, text: &str) -> Result<RichBlockDraft, Error> {
    let text: TextFragment = TextRun::try_new(text, FormatSet::default()).map_err(contract)?.into();
    RichBlockDraft::paragraph(&id(block)?, &text).map_err(contract)
}
fn draft() -> Result<TablePasteDraft, Error> {
    let image = ImageDraft::try_new(
        &id("pasted-image-block")?,
        &ImageBinding::new(
            ImageId::try_new("pasted-image").map_err(contract)?,
            AssetId::try_new("pasted-asset").map_err(contract)?,
            AssetGeneration::try_new("pasted-generation").map_err(contract)?,
            ImageAlt::decorative(),
            None,
        ),
        Some(paragraph("pasted-caption", "Pasted caption 🙂")?),
    )
    .map_err(contract)?;
    let list = RichListDraft::try_new(
        &id("pasted-list")?,
        RichListKind::Ordered(OrderedListStart::try_new(4).map_err(contract)?),
        vec![
            RichListItemDraft::try_new(
                &id("pasted-item")?,
                paragraph("paste-00", "Rich pasted body")?,
                vec![image.into()],
            )
            .map_err(contract)?,
        ],
    )
    .map_err(contract)?;
    let cell = |body: RichBlockDraft, header| {
        TableCellPasteDraft::try_new(vec![body], header).map_err(contract)
    };
    let stamp = CausalStamp::new(20, ChangeId::new(ReplicaId::try_new(1).map_err(contract)?, 0));
    TablePasteDraft::try_new(
        vec![
            vec![cell(list.into(), Some(false))?, cell(paragraph("paste-01", "Second")?, None)?],
            vec![
                cell(paragraph("paste-10", "Third")?, Some(true))?,
                cell(paragraph("paste-11", "Fourth")?, None)?,
            ],
        ],
        vec![
            TablePasteMerge::try_new(
                MergeId::try_new("pasted-merge").map_err(contract)?,
                stamp,
                (0, 0),
                (0, 1),
            )
            .map_err(contract)?,
        ],
    )
    .map_err(contract)
}
fn selections(document: &RichDocument) -> Result<(RichSelection, RichSelection), Error> {
    let cell = CellId::new(
        TableId::try_new("table-one").map_err(contract)?,
        RowId::try_new("r1").map_err(contract)?,
        ColumnId::try_new("c1").map_err(contract)?,
    );
    let grid = RichSelection::try_new(
        document,
        RichSelectionKind::Grid { anchor: cell.clone(), focus: cell },
    )
    .map_err(contract)?;
    let point = RichTextPoint::new(id("caption-one")?, TextOffset::ZERO, Affinity::After);
    let text = RichSelection::try_new(
        document,
        RichSelectionKind::TextRange { anchor: point.clone(), focus: point },
    )
    .map_err(contract)?;
    Ok((grid, text))
}

/// Execute rich rectangular paste and merged-grid clear with exact inverse bytes and selection maps.
///
/// # Errors
/// Rejects invalid input/drafts, absent fixture IDs, stale actions or failed exact inverses.
pub fn exercise(input: &str) -> Result<String, Error> {
    let (context, codec, original) = admitted(input)?;
    let (grid, text) = selections(&original)?;
    let actions = [
        (
            "paste",
            RichAction::PasteTableCells(
                PasteTableCells::capture(&original, &grid, draft()?).map_err(contract)?,
            ),
        ),
        (
            "clear",
            RichAction::ClearTableCells(
                ClearTableCells::capture(
                    &original,
                    &grid,
                    &[id("empty-00")?, id("empty-01")?, id("empty-10")?, id("empty-11")?],
                )
                .map_err(contract)?,
            ),
        ),
    ];
    let mut cases = Vec::new();
    for (name, action) in actions {
        let edit = action
            .apply(&context, &original)
            .map_err(contract)?
            .ok_or(Error::Contract("paste fixture edit"))?;
        let after_text = edit.map_selection(&text).map_err(contract)?;
        let after_grid = edit.map_selection(&grid).map_err(contract)?;
        let undo = edit
            .inverse()
            .apply(&context, edit.document())
            .map_err(contract)?
            .ok_or(Error::Contract("paste fixture undo"))?;
        let redo = undo
            .inverse()
            .apply(&context, undo.document())
            .map_err(contract)?
            .ok_or(Error::Contract("paste fixture redo"))?;
        let changed = codec.encode(edit.document().document()).map_err(contract)?;
        let view: Value =
            serde_json::from_str(&rich_ast_fixture::admit(&changed)?).map_err(contract)?;
        cases.push(json!({"name":name,"changed":changed,"view":view,
            "text":after_text.selection().map(|selection|selection_json(edit.document(), selection)).transpose()?,
            "grid":after_grid.selection().map(|selection|selection_json(edit.document(), selection)).transpose()?,
            "undone":codec.encode(undo.document().document()).map_err(contract)?,
            "redone":codec.encode(redo.document().document()).map_err(contract)?}));
    }
    Ok(json!({"initial":codec.encode(original.document()).map_err(contract)?,"cases":cases})
        .to_string())
}
