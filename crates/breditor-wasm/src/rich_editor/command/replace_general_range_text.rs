//! Canonical rich runs and explicit target; only Rust decides structural consequences.
use super::support::{checked, decode};
use crate::{BreditorError, rich_editor::selection::SelectionRecord};
use breditor_core::{
    codec::RichFormatsJsonCodec,
    document::{TextFragment, TextRun},
    rich_content::{
        RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichSelection,
        actions::RichGeneralRangePlan, allocate_general_range_paragraphs,
    },
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Run {
    text: String,
    formats_json: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    selection: SelectionRecord,
    runs: Vec<Run>,
    prefix: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let r: Record = decode(input)?;
    if r.runs.len() > 1000 || r.runs.iter().map(|r| r.text.len()).sum::<usize>() > 64 * 1024 {
        return Err(super::invalid());
    }
    let formats = RichFormatsJsonCodec::new(owner.context().clone());
    let runs = r
        .runs
        .into_iter()
        .map(|r| checked(TextRun::try_new(r.text, checked(formats.decode(&r.formats_json))?)))
        .collect::<Result<Vec<_>, _>>()?;
    let inserted = checked(TextFragment::try_from_runs(runs))?;
    let target = r.selection.into_kind()?;
    let plan = checked(RichGeneralRangePlan::capture(
        owner.state().document(),
        &checked(RichSelection::try_new(owner.state().document(), target.clone()))?,
        &inserted,
    ))?;
    let empty = checked(allocate_general_range_paragraphs(&r.prefix, plan.empty_blocks().len()))?;
    checked(owner.replace_general_range_text(observation, &target, &inserted, &empty))
}
