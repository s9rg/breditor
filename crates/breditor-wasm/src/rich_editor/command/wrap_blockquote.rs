//! Wrap an exact sibling interval without flattening its rich subtrees.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, WrapBlockquote},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    first: String,
    last: String,
    wrapper: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(WrapBlockquote::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.first))?,
        &checked(BlockId::try_new(record.last))?,
        &checked(BlockId::try_new(record.wrapper))?,
    ))?;
    dispatch(owner, observation, RichAction::WrapBlockquote(action))
}
