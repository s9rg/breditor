//! Exact rich paragraph/heading conversion preserving text identity and selection.
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{
    BlockId, RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichSelectionUpdate,
    actions::{RichAction, SetHeading},
};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    block: &str,
    level: Option<u8>,
) -> Result<RichLocalOutcome, BreditorError> {
    let block =
        BlockId::try_new(block).map_err(|_| error::rejected("breditor_rich.command_json"))?;
    let action = SetHeading::capture(owner.state().document(), &block, level)
        .map_err(|_| error::rejected("breditor_rich.command_rejected"))?;
    owner
        .dispatch(observation, &[RichAction::SetHeading(action)], RichSelectionUpdate::Map)
        .map_err(|error| error::session(&error))
}
