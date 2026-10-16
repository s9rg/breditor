//! Closed first-key replacement with a canonical decimal monotonic clock hint.
use super::support::{checked, decode};
use crate::{
    BreditorError,
    rich_editor::{error, selection::decimal},
};
use breditor_core::rich_content::{BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    paragraph: String,
    text: String,
    #[serde(deserialize_with = "decimal")]
    clock_ms: u64,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let data: Record = decode(input)?;
    let id = checked(BlockId::try_new(data.paragraph))?;
    owner
        .replace_atom_typing_text(observation, &id, &data.text, data.clock_ms)
        .map_err(|e| error::session(&e))
}
