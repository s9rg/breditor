//! Replace or remove an entire explicitly identified paragraph caption.
use super::drafts::TextRecord;
use super::support::{checked, decode, dispatch};
use crate::BreditorError;
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
    actions::{RichAction, SetImageCaption},
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Record {
    image: String,
    #[serde(deserialize_with = "super::support::nullable")]
    caption: Option<TextRecord>,
}
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let record: Record = decode(input)?;
    let action = checked(SetImageCaption::capture(
        owner.state().document(),
        &checked(breditor_core::rich_content::ImageId::try_new(record.image))?,
        record.caption.map(|value| value.draft(owner.context())).transpose()?,
    ))?;
    dispatch(owner, observation, RichAction::SetImageCaption(action))
}
