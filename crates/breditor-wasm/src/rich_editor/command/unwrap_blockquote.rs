//! Remove one quote layer with an exact retained local inverse.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, UnwrapBlockquote},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    wrapper: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(UnwrapBlockquote::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.wrapper))?,
    ))?;
    dispatch(owner, observation, RichAction::UnwrapBlockquote(action))
}
