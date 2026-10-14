//! Nest a contiguous rich item range beneath its preceding sibling.
use super::{
    drafts::list_kind,
    support::{checked, decode, dispatch, nullable},
};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{IndentListItems, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Nested {
    block: String,
    #[serde(deserialize_with = "nullable")]
    start: Option<u32>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    container: String,
    first: String,
    last: String,
    #[serde(deserialize_with = "nullable")]
    nested: Option<Nested>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let nested = record
        .nested
        .map(|value| Ok((checked(BlockId::try_new(value.block))?, list_kind(value.start)?)))
        .transpose()?;
    let action = checked(IndentListItems::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.container))?,
        &checked(BlockId::try_new(record.first))?,
        &checked(BlockId::try_new(record.last))?,
        nested,
    ))?;
    dispatch(owner, observation, RichAction::IndentListItems(action))
}
