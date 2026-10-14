//! Retract observed merge intents covering one stable base cell.
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use crate::rich_editor::selection::CellRecord;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SplitTableCell},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    cell: CellRecord,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action =
        checked(SplitTableCell::capture(owner.state().document(), &record.cell.into_cell()?))?;
    dispatch(owner, observation, RichAction::SplitTableCell(action))
}
