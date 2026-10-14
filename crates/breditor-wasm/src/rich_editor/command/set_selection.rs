//! Explicit stable text/node/grid selection; no coerced browser coordinates.
use crate::{
    BreditorError,
    rich_editor::{error, selection::SelectionRecord},
};
use breditor_core::rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    selection: Option<SelectionRecord>,
) -> Result<RichLocalOutcome, BreditorError> {
    owner
        .set_selection(observation, selection.map(SelectionRecord::into_kind).transpose()?)
        .map_err(|error| error::session(&error))
}
