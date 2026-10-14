//! Split the current collapsed flow caret into a fresh paragraph/heading, preserving typing style.
use super::{
    split_support,
    support::{checked, decode, nullable},
};
use crate::{BreditorError, rich_editor::selection::PointRecord};
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SplitTextBlock},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    point: PointRecord,
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
    let action = checked(SplitTextBlock::capture(
        owner.state().document(),
        &point,
        &right,
        record.right_heading,
    ))?;
    split_support::publish(owner, observation, RichAction::SplitTextBlock(action), right, formats)
}
