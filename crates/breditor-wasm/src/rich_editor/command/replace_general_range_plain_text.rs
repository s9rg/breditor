//! Explicit general plain target; Rust chooses coverage, styles and fresh floor count.
use super::support::{checked, decode};
use crate::{BreditorError, rich_editor::selection::SelectionRecord};
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot, allocate_general_range_paragraphs,
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    selection: SelectionRecord,
    text: String,
    prefix: String,
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
    let empty =
        checked(allocate_general_range_paragraphs(&r.prefix, plan.range().empty_blocks().len()))?;
    checked(owner.replace_general_range_plain_text(observation, &target, &r.text, &empty))
}
