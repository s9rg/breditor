//! Directional user deletion with exact range admission and a decimal clock hint.
use super::support::decode;
use crate::{
    BreditorError,
    rich_editor::{
        error,
        selection::{SelectionRecord, decimal},
    },
};
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichTypingDeleteDirection,
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Direction {
    Backward,
    Forward,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    selection: SelectionRecord,
    direction: Direction,
    #[serde(deserialize_with = "decimal")]
    clock_ms: u64,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    snapshot: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let data: Record = decode(input)?;
    let direction = match data.direction {
        Direction::Backward => RichTypingDeleteDirection::Backward,
        Direction::Forward => RichTypingDeleteDirection::Forward,
    };
    owner
        .delete_typing_range(snapshot, &data.selection.into_kind()?, direction, data.clock_ms)
        .map_err(|value| error::session(&value))
}
