//! Replace a text selection and insert fresh rich flow at its caret as one exact undo unit.
use super::{
    clipboard_ids::Allocation,
    input_plan::Plan,
    support::{checked, decode},
};
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    codec::RichClipboardJsonCodec,
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichPendingFormatsUpdate,
        RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        actions::{InsertBlocks, ReplaceTextRange, RichAction, SplitTextBlock},
    },
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    clipboard_json: String,
    allocation: Allocation,
    right: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let right = checked(BlockId::try_new(record.right))?;
    let fragment = checked(
        RichClipboardJsonCodec::new(owner.context().clone()).decode(&record.clipboard_json),
    )?;
    let blocks =
        checked(fragment.flow_drafts(owner.context(), &mut record.allocation.allocator()?))?;
    let selection = owner.state().selection().ok_or(super::invalid())?;
    let replace = checked(ReplaceTextRange::capture(
        owner.state().document(),
        selection,
        &TextFragment::empty(),
    ))?;
    let point = replace.insertion_end().clone();
    let mut plan = Plan::new(owner);
    plan.add(RichAction::ReplaceTextRange(replace))?;
    plan.add(RichAction::SplitTextBlock(checked(SplitTextBlock::capture(
        &plan.document,
        &point,
        &right,
        None,
    ))?))?;
    let position = plan.document.flow_position_before(&right).ok_or(super::invalid())?;
    plan.add(RichAction::InsertBlocks(checked(InsertBlocks::capture(
        &plan.document,
        &position,
        blocks,
    ))?))?;
    let caret = RichTextPoint::new(right, TextOffset::ZERO, Affinity::After);
    owner
        .dispatch_with_pending_formats(
            observation,
            &plan.actions,
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            RichPendingFormatsUpdate::Set(None),
        )
        .map_err(|value| error::session(&value))
}
