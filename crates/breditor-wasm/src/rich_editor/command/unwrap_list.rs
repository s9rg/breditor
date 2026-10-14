//! Remove one whole list layer without discarding rich item bodies.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, UnwrapList},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    list: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(UnwrapList::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.list))?,
    ))?;
    dispatch(owner, observation, RichAction::UnwrapList(action))
}
