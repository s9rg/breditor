//! Explicit first-key target; no temporary selection and no prior-burst join.
use super::support::{checked, decode};
use crate::{
    BreditorError,
    rich_editor::selection::{SelectionRecord, decimal},
};
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot, allocate_general_range_paragraphs,
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    selection: SelectionRecord,
    text: String,
    prefix: String,
    #[serde(deserialize_with = "decimal")]
    clock_ms: u64,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let r: Record = decode(input)?;
    if r.text.len() > 64 * 1024 {
        return Err(super::invalid());
    }
    let target = r.selection.into_kind()?;
    let plan = checked(owner.plan_general_range_plain_text(observation, &target, &r.text))?;
    let count = if r.text.is_empty() { 0 } else { plan.range().empty_blocks().len() };
    let empty = checked(allocate_general_range_paragraphs(&r.prefix, count))?;
    checked(owner.replace_general_range_typing_text(
        observation,
        &target,
        &r.text,
        &empty,
        r.clock_ms,
    ))
}
