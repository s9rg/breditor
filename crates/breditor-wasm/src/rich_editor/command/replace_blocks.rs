//! Replace an ordered flow interval atomically with explicit rich drafts.
use super::drafts::FlowRecord;
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{ReplaceBlocks, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    first: String,
    last: String,
    blocks: Vec<FlowRecord>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(ReplaceBlocks::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.first))?,
        &checked(BlockId::try_new(record.last))?,
        record
            .blocks
            .into_iter()
            .map(|value| value.draft(owner.context()))
            .collect::<Result<_, _>>()?,
    ))?;
    dispatch(owner, observation, RichAction::ReplaceBlocks(action))
}
