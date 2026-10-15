//! Set explicit completion intent; never replay a DOM-derived toggle.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SetTaskChecked},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    item: String,
    checked: bool,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(SetTaskChecked::capture(
        owner.state().document(),
        &checked(BlockId::try_new(record.item))?,
        record.checked,
    ))?;
    dispatch(owner, observation, RichAction::SetTaskChecked(action))
}
