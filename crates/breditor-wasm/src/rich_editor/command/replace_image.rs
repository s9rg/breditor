//! Replace an asset and binding generation atomically without replacing the image node.
use super::support::{checked, decode, dispatch};

use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{ReplaceImage, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    image: String,
    asset: String,
    generation: String,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(ReplaceImage::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::ImageId::try_new(record.image))?,
        checked(breditor_core::rich_content::AssetId::try_new(record.asset))?,
        checked(breditor_core::rich_content::AssetGeneration::try_new(record.generation))?,
    ))?;
    dispatch(owner, observation, RichAction::ReplaceImage(action))
}
