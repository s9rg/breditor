//! Apply one exact local undo through the observation-guarded exclusive owner.
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
) -> Result<RichLocalOutcome, BreditorError> {
    owner.undo(observation).map_err(|value| error::session(&value))
}
