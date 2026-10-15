//! No-payload hard break: one guarded LF, never a structural Enter or caller-supplied HTML.
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};

pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
) -> Result<RichLocalOutcome, BreditorError> {
    owner.insert_hard_break(observation).map_err(|error| error::session(&error))
}
