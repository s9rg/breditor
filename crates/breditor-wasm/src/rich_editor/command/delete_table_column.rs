//! Remove a stable column and its owned bodies as one undo unit.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{DeleteTableColumn, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    table: String,
    column: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(DeleteTableColumn::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::TableId::try_new(record.table))?,
        &checked(breditor_core::rich_content::ColumnId::try_new(record.column))?,
    ))?;
    dispatch(owner, observation, RichAction::DeleteTableColumn(action))
}
