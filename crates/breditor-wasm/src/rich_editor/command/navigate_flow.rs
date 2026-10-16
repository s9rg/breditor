//! Strict selection-only native flow navigation; no document edit or JavaScript planning.
use super::{flow_direction::Direction, support::decode};
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    movement: Direction,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    owner.navigate_flow(observation, record.movement.into()).map_err(|value| error::session(&value))
}
