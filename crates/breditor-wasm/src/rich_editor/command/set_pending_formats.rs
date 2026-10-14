//! Typed rich pending-format overrides; null means derivation, [] means explicit plain.
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    codec::RichFormatsJsonCodec,
    rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot},
};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let formats = if input == "null" {
        None
    } else {
        Some(
            RichFormatsJsonCodec::new(owner.context().clone())
                .decode(input)
                .map_err(|_| error::rejected("breditor_rich.formats_rejected"))?,
        )
    };
    owner.set_pending_formats(observation, formats).map_err(|error| error::session(&error))
}
