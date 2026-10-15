//! Insert an explicitly identified rule at an admitted stable flow position.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{InsertHorizontalRule, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    position: super::drafts::PositionRecord,
    block: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(InsertHorizontalRule::capture(
        owner.state().document(),
        &record.position.position()?,
        &checked(BlockId::try_new(record.block))?,
    ))?;
    dispatch(owner, observation, RichAction::InsertHorizontalRule(action))
}
