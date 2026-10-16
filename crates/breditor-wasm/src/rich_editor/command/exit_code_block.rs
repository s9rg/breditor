//! Strict code-exit intent: Rust derives the flow gap from the guarded native caret.
use super::support::{checked, decode};
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    paragraph: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let paragraph = checked(BlockId::try_new(record.paragraph))?;
    owner.exit_code_block(observation, &paragraph).map_err(|value| error::session(&value))
}
