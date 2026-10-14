//! Insert one immutable-asset image with an optional rich paragraph caption.
use super::drafts::{ImageRecord, PositionRecord};
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{InsertImage, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    position: PositionRecord,
    image: ImageRecord,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(InsertImage::capture(
        owner.state().document(),
        &record.position.position()?,
        record.image.draft(owner.context())?,
    ))?;
    dispatch(owner, observation, RichAction::InsertImage(action))
}
