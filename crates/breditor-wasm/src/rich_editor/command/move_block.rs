//! Move one retained block subtree to a stable parent/before position as one undo group.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{MoveBlock, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    block: String,
    #[serde(deserialize_with = "super::support::nullable")]
    parent: Option<String>,
    #[serde(deserialize_with = "super::support::nullable")]
    before: Option<String>,
}
fn id(value: Option<String>) -> Result<Option<BlockId>, BreditorError> {
    value.map(BlockId::try_new).map(checked).transpose()
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(MoveBlock::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.block))?,
        id(record.parent)?.as_ref(),
        id(record.before)?.as_ref(),
    ))?;
    dispatch(owner, observation, RichAction::MoveBlock(action))
}
