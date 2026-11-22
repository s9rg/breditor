//! Move a later item text block and its following flow into a fresh sibling item.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SplitListItem},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    block: String,
    new_item: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(SplitListItem::capture_block(
        owner.state().document(),
        &checked(BlockId::try_new(record.block))?,
        &checked(BlockId::try_new(record.new_item))?,
    ))?;
    dispatch(owner, observation, RichAction::SplitListItem(action))
}
