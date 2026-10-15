//! Real axis additions plus span-aware grid movement in matching native/Wasm.

use crate::{
    Error,
    table_axis_fixture::{admitted, selection_json},
};
use breditor_core::{
    document::{FormatSet, TextFragment, TextRun},
    rich_content::{
        BlockId, CausalStamp, CellId, ChangeId, ColumnId, GridMove, GridNavigationMode,
        GridNavigationOutcome, MergeId, ReplicaId, RichBlockDraft, RichDocument, RichSelection,
        RichSelectionKind, RowId, TableCellDraft, TableColumnDraft, TableId, TableRowDraft,
        actions::{InsertTableColumn, InsertTableRow, MergeTableCells},
        navigate_grid,
    },
    state::EditorContext,
};
use serde_json::{Value, json};

fn contract(_error: impl std::fmt::Display) -> Error {
    Error::Contract("rich grid navigation fixture")
}
fn cell(row: &str, column: &str) -> Result<CellId, Error> {
    Ok(CellId::new(
        TableId::try_new("table-one").map_err(contract)?,
        RowId::try_new(row).map_err(contract)?,
        ColumnId::try_new(column).map_err(contract)?,
    ))
}
fn grid(
    doc: &RichDocument,
    anchor: (&str, &str),
    focus: (&str, &str),
) -> Result<RichSelection, Error> {
    RichSelection::try_new(
        doc,
        RichSelectionKind::Grid {
            anchor: cell(anchor.0, anchor.1)?,
            focus: cell(focus.0, focus.1)?,
        },
    )
    .map_err(contract)
}
fn body(row: &str, column: &str) -> Result<TableCellDraft, Error> {
    let text: TextFragment =
        TextRun::try_new(format!("{row}:{column}"), FormatSet::default()).map_err(contract)?.into();
    let body = RichBlockDraft::paragraph(
        &BlockId::try_new(format!("nav-body-{row}-{column}")).map_err(contract)?,
        &text,
    )
    .map_err(contract)?;
    TableCellDraft::try_new(
        &BlockId::try_new(format!("nav-cell-{row}-{column}")).map_err(contract)?,
        ColumnId::try_new(column).map_err(contract)?,
        false,
        vec![body],
    )
    .map_err(contract)
}
fn expand(context: &EditorContext, mut doc: RichDocument) -> Result<RichDocument, Error> {
    let table = TableId::try_new("table-one").map_err(contract)?;
    for name in ["c2", "c3"] {
        let column = TableColumnDraft::try_new(ColumnId::try_new(name).map_err(contract)?, 160)
            .map_err(contract)?;
        let cells = ["r0", "r1"]
            .into_iter()
            .map(|row| Ok((RowId::try_new(row).map_err(contract)?, body(row, name)?)))
            .collect::<Result<Vec<_>, Error>>()?;
        let action =
            InsertTableColumn::capture(&doc, &table, None, &column, cells).map_err(contract)?;
        doc = action
            .apply(context, &doc)
            .map_err(contract)?
            .ok_or(Error::Contract("insert navigation column"))?
            .into_parts()
            .0;
    }
    let cells = ["c0", "c1", "c2", "c3"]
        .into_iter()
        .map(|column| body("r2", column))
        .collect::<Result<Vec<_>, _>>()?;
    let row = TableRowDraft::try_new(
        &BlockId::try_new("nav-row-r2").map_err(contract)?,
        RowId::try_new("r2").map_err(contract)?,
        cells,
    )
    .map_err(contract)?;
    let action = InsertTableRow::capture(&doc, &table, None, row).map_err(contract)?;
    doc = action
        .apply(context, &doc)
        .map_err(contract)?
        .ok_or(Error::Contract("insert navigation row"))?
        .into_parts()
        .0;
    let stamp = CausalStamp::new(10, ChangeId::new(ReplicaId::try_new(7).map_err(contract)?, 2));
    let action = MergeTableCells::capture(
        &doc,
        &grid(&doc, ("r0", "c3"), ("r2", "c3"))?,
        MergeId::try_new("nav-vertical").map_err(contract)?,
        stamp,
    )
    .map_err(contract)?;
    Ok(action
        .apply(context, &doc)
        .map_err(contract)?
        .ok_or(Error::Contract("navigation span"))?
        .into_parts()
        .0)
}
fn outcome(doc: &RichDocument, outcome: GridNavigationOutcome) -> Result<Value, Error> {
    Ok(match outcome {
        GridNavigationOutcome::Moved(selection) => json!({"moved":selection_json(doc,&selection)?}),
        GridNavigationOutcome::Boundary(boundary) => json!({"boundary":format!("{boundary:?}")}),
        GridNavigationOutcome::Unchanged => json!({"unchanged":true}),
    })
}

/// Exercise real 3×4 rich geometry with a 2×2 span and a separate full-height span.
///
/// # Errors
/// Rejects bad source data, axis edits, movement or admitted selection contradictions.
pub fn exercise(input: &str) -> Result<String, Error> {
    let (context, codec, doc) = admitted(input)?;
    let doc = expand(&context, doc)?;
    let mut current = grid(&doc, ("r0", "c0"), ("r0", "c0"))?;
    let mut tab = vec![selection_json(&doc, &current)?];
    loop {
        match navigate_grid(&doc, &current, GridMove::Next, GridNavigationMode::Collapse)
            .map_err(contract)?
        {
            GridNavigationOutcome::Moved(selection) => {
                tab.push(selection_json(&doc, &selection)?);
                current = selection;
            }
            GridNavigationOutcome::Boundary(
                breditor_core::rich_content::GridBoundary::AfterTable,
            ) => break,
            _ => return Err(Error::Contract("navigation tab outcome")),
        }
    }
    let mut cases = Vec::new();
    for (origin, movement) in [
        (("r1", "c1"), GridMove::Right),
        (("r1", "c1"), GridMove::Down),
        (("r2", "c2"), GridMove::Right),
        (("r2", "c3"), GridMove::Left),
        (("r1", "c3"), GridMove::Down),
        (("r1", "c2"), GridMove::RowEnd),
        (("r1", "c2"), GridMove::TableEnd),
    ] {
        let selection = grid(&doc, origin, origin)?;
        cases.push(json!({"move":format!("{movement:?}"),"origin":selection_json(&doc,&selection)?,"result":outcome(&doc,navigate_grid(&doc,&selection,movement,GridNavigationMode::Collapse).map_err(contract)?)?}));
    }
    let selection = grid(&doc, ("r0", "c2"), ("r1", "c1"))?;
    let extended = outcome(
        &doc,
        navigate_grid(&doc, &selection, GridMove::Down, GridNavigationMode::Extend)
            .map_err(contract)?,
    )?;
    Ok(json!({"document":codec.encode(doc.document()).map_err(contract)?,"tab":tab,"cases":cases,"extended":extended}).to_string())
}
