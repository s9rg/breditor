//! Remove a whole table with an explicit replacement when its flow cannot be empty.
use super::drafts::FlowRecord;
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{DeleteTable, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    table: String,
    #[serde(deserialize_with = "super::support::nullable")]
    replacement: Option<FlowRecord>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(DeleteTable::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::TableId::try_new(record.table))?,
        record.replacement.map(|value| value.draft(owner.context())).transpose()?,
    ))?;
    dispatch(owner, observation, RichAction::DeleteTable(action))
}
