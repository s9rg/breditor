//! Set one stable column's checked logical display width.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{ResizeColumn, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    table: String,
    column: String,
    width: u32,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(ResizeColumn::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::TableId::try_new(record.table))?,
        &checked(breditor_core::rich_content::ColumnId::try_new(record.column))?,
        record.width,
    ))?;
    dispatch(owner, observation, RichAction::ResizeColumn(action))
}
