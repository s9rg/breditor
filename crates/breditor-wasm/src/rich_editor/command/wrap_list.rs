//! Wrap a stable flow range into rich items, preserving all trailing media.
use super::drafts::list_kind;
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, WrapList},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    first: String,
    last: String,
    container: String,
    items: Vec<String>,
    #[serde(deserialize_with = "super::support::nullable")]
    start: Option<u32>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(WrapList::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.first))?,
        &checked(BlockId::try_new(record.last))?,
        &checked(BlockId::try_new(record.container))?,
        &record
            .items
            .into_iter()
            .map(BlockId::try_new)
            .map(checked)
            .collect::<Result<Vec<_>, _>>()?,
        list_kind(record.start)?,
    ))?;
    dispatch(owner, observation, RichAction::WrapList(action))
}
