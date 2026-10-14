//! Apply paired checked image dimensions or return to intrinsic sizing.
use super::drafts::SizeRecord;
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{ResizeImage, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    image: String,
    #[serde(deserialize_with = "super::support::nullable")]
    size: Option<SizeRecord>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(ResizeImage::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::ImageId::try_new(record.image))?,
        record.size.map(SizeRecord::size).transpose()?,
    ))?;
    dispatch(owner, observation, RichAction::ResizeImage(action))
}
