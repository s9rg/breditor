//! Native source selection determines all scalar targets; requests contain changes only.
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    codec::decode_rich_selection_format_changes,
    rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot},
};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let changes = decode_rich_selection_format_changes(owner.context(), input)
        .map_err(|_| error::rejected("breditor_rich.selection_formats"))?;
    owner.change_selection_formats(observation, &changes).map_err(|e| error::session(&e))
}
