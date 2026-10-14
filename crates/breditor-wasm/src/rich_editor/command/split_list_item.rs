//! Split a current leading list caret, retaining trailing images/nested flow in the fresh item.
use super::{
    split_support,
    support::{checked, decode, nullable},
};
use crate::{BreditorError, rich_editor::selection::PointRecord};
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SplitListItem},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    point: PointRecord,
    new_item: String,
    right: String,
    #[serde(deserialize_with = "nullable")]
    right_heading: Option<u8>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let point = record.point.into_point()?;
    let formats = split_support::current_formats(owner, &point)?;
    let right = checked(BlockId::try_new(record.right))?;
    let action = checked(SplitListItem::capture(
        owner.state().document(),
        &point,
        &checked(BlockId::try_new(record.new_item))?,
        &right,
        record.right_heading,
    ))?;
    split_support::publish(owner, observation, RichAction::SplitListItem(action), right, formats)
}
