//! Insert typed rich flow blocks including nested lists, tables and images.
use super::drafts::{FlowRecord, PositionRecord};
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{InsertBlocks, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    position: PositionRecord,
    blocks: Vec<FlowRecord>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(InsertBlocks::capture(
        owner.state().document(),
        &record.position.position()?,
        record
            .blocks
            .into_iter()
            .map(|value| value.draft(owner.context()))
            .collect::<Result<_, _>>()?,
    ))?;
    dispatch(owner, observation, RichAction::InsertBlocks(action))
}
