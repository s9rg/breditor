//! Promote/unlist tasks with explicit suffix identity and exact inverse metadata.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{OutdentTaskItems, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    container: String,
    first: String,
    last: String,
    #[serde(deserialize_with = "super::support::nullable")]
    tail: Option<String>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(OutdentTaskItems::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.container))?,
        &checked(BlockId::try_new(record.first))?,
        &checked(BlockId::try_new(record.last))?,
        record.tail.map(BlockId::try_new).map(checked).transpose()?.as_ref(),
    ))?;
    dispatch(owner, observation, RichAction::OutdentTaskItems(action))
}
