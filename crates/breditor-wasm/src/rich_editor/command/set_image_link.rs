//! Strict candidate-V4 image-link intent on one explicit image (set, replace or clear).
use super::support::{checked, dispatch};
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    codec::decode_rich_image_link_command,
    rich_content::{
        RichLocalOutcome, RichLocalSession, RichLocalSnapshot,
        actions::{RichAction, SetImageLink},
    },
};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let (image, link) = decode_rich_image_link_command(owner.context(), input)
        .map_err(|_| error::rejected("breditor_rich.image_link_intent"))?;
    let action = checked(SetImageLink::capture(owner.state().document(), &image, link.as_ref()))?;
    dispatch(owner, observation, RichAction::SetImageLink(action))
}
