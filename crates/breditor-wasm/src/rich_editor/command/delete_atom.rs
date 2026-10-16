//! Closed native deletion intent, not an AST replacement supplied by JavaScript.
use super::{
    flow_direction::Direction,
    support::{checked, decode},
};
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    paragraph: String,
    movement: Direction,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let data: Record = decode(input)?;
    let id = checked(BlockId::try_new(data.paragraph))?;
    owner.delete_atom(observation, &id, data.movement.into()).map_err(|e| error::session(&e))
}
