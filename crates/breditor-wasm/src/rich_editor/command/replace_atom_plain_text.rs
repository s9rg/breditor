//! Explicit plain paste/programmatic replacement of a whole selected atom.
use super::support::{checked, decode};
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    paragraph: String,
    text: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let data: Record = decode(input)?;
    let id = checked(BlockId::try_new(data.paragraph))?;
    owner.replace_atom_plain_text(observation, &id, &data.text).map_err(|e| error::session(&e))
}
