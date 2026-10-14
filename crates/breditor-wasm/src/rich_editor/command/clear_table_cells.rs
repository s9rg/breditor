//! Clear every selected base-cell body with explicit fresh empty paragraph identities.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{ClearTableCells, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    empty_blocks: Vec<String>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let ids = record
        .empty_blocks
        .into_iter()
        .map(BlockId::try_new)
        .map(checked)
        .collect::<Result<Vec<_>, _>>()?;
    let action = checked(ClearTableCells::capture(
        owner.state().document(),
        owner.state().selection().ok_or(super::invalid())?,
        &ids,
    ))?;
    dispatch(owner, observation, RichAction::ClearTableCells(action))
}
