//! Strict bounded layout intent; native selection coverage owns every target.
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    codec::decode_rich_block_layout_patch,
    rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot},
};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let patch = decode_rich_block_layout_patch(owner.context(), input)
        .map_err(|_| error::rejected("breditor_rich.block_layout_intent"))?;
    owner.change_selection_layout(observation, &patch).map_err(|e| error::session(&e))
}
