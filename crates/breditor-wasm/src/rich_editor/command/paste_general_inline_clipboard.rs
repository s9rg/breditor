//! Strict native clipboard decoding and general target planning; no JavaScript run reconstruction.
use super::support::{checked, decode};
use crate::{BreditorError, rich_editor::selection::SelectionRecord};
use breditor_core::{
    codec::RichClipboardJsonCodec,
    rich_content::{
        RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichSelection,
        actions::RichGeneralRangePlan, allocate_general_range_paragraphs,
    },
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    selection: SelectionRecord,
    clipboard_json: String,
    prefix: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let r: Record = decode(input)?;
    let clipboard =
        checked(RichClipboardJsonCodec::new(owner.context().clone()).decode(&r.clipboard_json))?;
    let inserted = checked(clipboard.text_fragment(owner.context()))?;
    if inserted.iter().count() > 1000
        || inserted.iter().map(|run| run.text().len()).sum::<usize>() > 64 * 1024
    {
        return Err(super::invalid());
    }
    let target = r.selection.into_kind()?;
    let selection = checked(RichSelection::try_new(owner.state().document(), target.clone()))?;
    let plan =
        checked(RichGeneralRangePlan::capture(owner.state().document(), &selection, &inserted))?;
    let empty = checked(allocate_general_range_paragraphs(&r.prefix, plan.empty_blocks().len()))?;
    checked(owner.paste_general_inline_clipboard(observation, &target, &clipboard, &empty))
}
