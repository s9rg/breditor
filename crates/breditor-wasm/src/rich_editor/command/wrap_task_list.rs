//! Wrap prose-led task groups with explicit identities and completion values.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, WrapTaskList},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Item {
    block: String,
    checked: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    first: String,
    last: String,
    container: String,
    items: Vec<Item>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let items = record
        .items
        .into_iter()
        .map(|item| Ok((checked(BlockId::try_new(item.block))?, item.checked)))
        .collect::<Result<Vec<_>, BreditorError>>()?;
    let action = checked(WrapTaskList::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.first))?,
        &checked(BlockId::try_new(record.last))?,
        &checked(BlockId::try_new(record.container))?,
        &items,
    ))?;
    dispatch(owner, observation, RichAction::WrapTaskList(action))
}
