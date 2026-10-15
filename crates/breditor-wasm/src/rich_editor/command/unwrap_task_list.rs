//! Remove one task-list layer while Undo retains its item metadata.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, UnwrapTaskList},
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
    let action = checked(UnwrapTaskList::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.list))?,
    ))?;
    dispatch(owner, observation, RichAction::UnwrapTaskList(action))
}
