//! Remove an image without deleting shared host asset bytes.
use super::drafts::FlowRecord;
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{DeleteImage, RichAction},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    image: String,
    #[serde(deserialize_with = "super::support::nullable")]
    replacement: Option<FlowRecord>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(DeleteImage::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::ImageId::try_new(record.image))?,
        record.replacement.map(|value| value.draft(owner.context())).transpose()?,
    ))?;
    dispatch(owner, observation, RichAction::DeleteImage(action))
}
