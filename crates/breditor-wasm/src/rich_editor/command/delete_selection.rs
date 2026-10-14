//! Delete the current supported text range as one atomic history unit.
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
) -> Result<RichLocalOutcome, BreditorError> {
    owner.replace_selection_plain_text(observation, "").map_err(|value| error::session(&value))
}
