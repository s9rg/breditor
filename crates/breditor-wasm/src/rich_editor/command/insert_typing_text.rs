//! Same-caret user insertion with a canonical decimal monotonic clock hint.
use super::support::decode;
use crate::{
    BreditorError,
    rich_editor::{error, selection::decimal},
};
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    text: String,
    #[serde(deserialize_with = "decimal")]
    clock_ms: u64,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    snapshot: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let data: Record = decode(input)?;
    owner
        .insert_typing_text(snapshot, &data.text, data.clock_ms)
        .map_err(|value| error::session(&value))
}
