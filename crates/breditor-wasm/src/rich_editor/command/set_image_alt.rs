//! Apply explicit decorative intent or a checked image description.
use super::drafts::AltRecord;
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SetImageAlt},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    image: String,
    alt: AltRecord,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(SetImageAlt::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::ImageId::try_new(record.image))?,
        record.alt.alt()?,
    ))?;
    dispatch(owner, observation, RichAction::SetImageAlt(action))
}
