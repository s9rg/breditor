//! Remove a stable table row while retaining an exact local inverse.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{DeleteTableRow, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    table: String,
    row: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(DeleteTableRow::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::TableId::try_new(record.table))?,
        &checked(breditor_core::rich_content::RowId::try_new(record.row))?,
    ))?;
    dispatch(owner, observation, RichAction::DeleteTableRow(action))
}
