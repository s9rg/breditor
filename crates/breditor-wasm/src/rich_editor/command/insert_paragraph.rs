//! Replace a selected span and split paragraph/list structure as one exact Enter history unit.
use super::{
    input_plan::Plan,
    support::{checked, decode, nullable},
};
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    document::TextFragment,
    position::{Affinity, TextOffset},
    rich_content::{
        BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichPendingFormatsUpdate,
        RichSelectionKind, RichSelectionUpdate, RichTextPoint,
        actions::{ReplaceTextRange, RichAction, SplitListItem, SplitTextBlock},
    },
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    right: String,
    #[serde(deserialize_with = "nullable")]
    new_item: Option<String>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let right = checked(BlockId::try_new(record.right))?;
    let item = record.new_item.map(BlockId::try_new).map(checked).transpose()?;
    let formats = super::input_plan::formats(owner)?;
    let selection = owner.state().selection().ok_or(super::invalid())?;
    let replace = checked(ReplaceTextRange::capture(
        owner.state().document(),
        selection,
        &TextFragment::empty(),
    ))?;
    let point = replace.insertion_end().clone();
    let mut plan = Plan::new(owner);
    plan.add(RichAction::ReplaceTextRange(replace))?;
    let path = plan.document.block_path(point.block()).ok_or(super::invalid())?;
    let list_head = path.last_index() == Some(0)
        && path
            .parent()
            .and_then(|parent| plan.document.document().node_at(&parent).ok())
            .and_then(breditor_core::document::NodeRef::as_element)
            .is_some_and(|parent| parent.kind().as_str() == "breditor/list-item");
    let action = if list_head {
        RichAction::SplitListItem(checked(SplitListItem::capture(
            &plan.document,
            &point,
            item.as_ref().ok_or(super::invalid())?,
            &right,
            None,
        ))?)
    } else {
        if item.is_some() {
            return Err(super::invalid());
        }
        RichAction::SplitTextBlock(checked(SplitTextBlock::capture(
            &plan.document,
            &point,
            &right,
            None,
        ))?)
    };
    plan.add(action)?;
    let caret = RichTextPoint::new(right, TextOffset::ZERO, Affinity::After);
    owner
        .dispatch_with_pending_formats(
            observation,
            &plan.actions,
            RichSelectionUpdate::Set(Some(RichSelectionKind::TextRange {
                anchor: caret.clone(),
                focus: caret,
            })),
            RichPendingFormatsUpdate::Set(Some(formats)),
        )
        .map_err(|value| error::session(&value))
}
