//! Atom-adjacent plain paragraph intent; Rust derives scope and authors the original action.
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
    side: Direction,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let id = checked(BlockId::try_new(record.paragraph))?;
    owner
        .insert_paragraph_adjacent(observation, &id, record.side.into())
        .map_err(|value| error::session(&value))
}
