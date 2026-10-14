//! Range-aware plain typing/deletion with exact guarded source observation.
use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    text: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    owner.replace_selection_plain_text(observation, text).map_err(|error| error::session(&error))
}
