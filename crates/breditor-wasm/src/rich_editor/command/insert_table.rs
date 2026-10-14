//! Insert an explicitly drafted whole table in stable flow space.
use super::drafts::{PositionRecord, TableRecord};
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{InsertTable, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    position: PositionRecord,
    table: TableRecord,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(InsertTable::capture(
        owner.state().document(),
        &record.position.position()?,
        record.table.draft(owner.context())?,
    ))?;
    dispatch(owner, observation, RichAction::InsertTable(action))
}
