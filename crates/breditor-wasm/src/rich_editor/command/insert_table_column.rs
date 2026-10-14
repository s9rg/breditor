//! Insert a stable column with exactly one explicitly drafted body per existing row.
use super::{
    drafts::{CellDraftRecord, ColumnRecord},
    support::{checked, decode, dispatch, nullable},
};
use crate::BreditorError;
use breditor_core::rich_content::{
    ColumnId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RowId, TableId,
    actions::{InsertTableColumn, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    table: String,
    #[serde(deserialize_with = "nullable")]
    before: Option<String>,
    column: ColumnRecord,
    cells: Vec<RowCell>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RowCell {
    row: String,
    cell: CellDraftRecord,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let cells = record
        .cells
        .into_iter()
        .map(|value| Ok((checked(RowId::try_new(value.row))?, value.cell.draft(owner.context())?)))
        .collect::<Result<_, BreditorError>>()?;
    let action = checked(InsertTableColumn::capture(
        owner.state().document(),
        &checked(TableId::try_new(record.table))?,
        record.before.map(ColumnId::try_new).map(checked).transpose()?.as_ref(),
        &record.column.draft()?,
        cells,
    ))?;
    dispatch(owner, observation, RichAction::InsertTableColumn(action))
}
