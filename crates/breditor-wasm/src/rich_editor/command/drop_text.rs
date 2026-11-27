//! Move or copy one single-block text range to a collapsed target as one undo group
//! (inline drag-and-drop inside one editor; contract in core `local_session/drop_text.rs`).
use super::support::decode;
use crate::{
    BreditorError,
    rich_editor::{
        error,
        selection::{PointRecord, SelectionRecord},
    },
};
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichTextDropEffect,
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Effect {
    Move,
    Copy,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    source: SelectionRecord,
    target: PointRecord,
    effect: Effect,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let effect = match record.effect {
        Effect::Move => RichTextDropEffect::Move,
        Effect::Copy => RichTextDropEffect::Copy,
    };
    owner
        .drop_text(observation, record.source.into_kind()?, record.target.into_point()?, effect)
        .map_err(|value| error::session(&value))
}
