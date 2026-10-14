//! Join adjacent rich text blocks and preserve witnessed suffix positions.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{JoinTextBlocks, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    left: String,
    right: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(JoinTextBlocks::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.left))?,
        &checked(BlockId::try_new(record.right))?,
    ))?;
    dispatch(owner, observation, RichAction::JoinTextBlocks(action))
}
