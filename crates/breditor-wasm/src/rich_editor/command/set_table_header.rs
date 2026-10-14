//! Apply header intent across the current merge-closed grid selection.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SetTableHeader},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    header: bool,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(SetTableHeader::capture(
        owner.state().document(),
        owner.state().selection().ok_or(super::invalid())?,
        record.header,
    ))?;
    dispatch(owner, observation, RichAction::SetTableHeader(action))
}
