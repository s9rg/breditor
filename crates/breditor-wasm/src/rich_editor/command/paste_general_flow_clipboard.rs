//! Strict additive general structured paste; the original flow-at-text command is unchanged.
use super::{
    clipboard_ids::Allocation,
    support::{checked, decode},
};
use crate::{
    BreditorError,
    rich_editor::{error, selection::SelectionRecord},
};
use breditor_core::{
    codec::RichClipboardJsonCodec,
    document::TextFragment,
    rich_content::{
        BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichSelection,
        actions::RichGeneralRangePlan, allocate_general_range_paragraphs,
    },
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    selection: SelectionRecord,
    clipboard_json: String,
    allocation: Allocation,
    prefix: String,
    right: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let target = record.selection.into_kind()?;
    let selection = checked(RichSelection::try_new(owner.state().document(), target.clone()))?;
    let plan = checked(RichGeneralRangePlan::capture(
        owner.state().document(),
        &selection,
        &TextFragment::empty(),
    ))?;
    let empty =
        checked(allocate_general_range_paragraphs(&record.prefix, plan.empty_blocks().len()))?;
    let clip = checked(
        RichClipboardJsonCodec::new(owner.context().clone()).decode(&record.clipboard_json),
    )?;
    let right = checked(BlockId::try_new(record.right))?;
    owner
        .paste_general_flow_clipboard(
            observation,
            &target,
            &clip,
            &empty,
            &right,
            &mut record.allocation.allocator()?,
        )
        .map_err(|value| error::session(&value))
}
