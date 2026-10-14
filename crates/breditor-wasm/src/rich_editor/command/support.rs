//! Shared checked construction/publication helpers, never unchecked AST rewrites.

use crate::{BreditorError, rich_editor::error};
use breditor_core::rich_content::{
    RichLocalOutcome, RichLocalSession, RichLocalSnapshot, RichSelectionUpdate, actions::RichAction,
};
use serde::{Deserialize, Deserializer};

pub(super) fn checked<T, E>(result: Result<T, E>) -> Result<T, BreditorError> {
    result.map_err(|_| error::rejected("breditor_rich.command_rejected"))
}
pub(super) fn decode<'a, T: Deserialize<'a>>(input: &'a str) -> Result<T, BreditorError> {
    serde_json::from_str(input).map_err(|_| error::rejected("breditor_rich.command_json"))
}
pub(super) fn nullable<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    decoder: D,
) -> Result<Option<T>, D::Error> {
    Option::<T>::deserialize(decoder)
}
pub(super) fn dispatch(
    owner: &mut RichLocalSession,
    snapshot: &RichLocalSnapshot,
    action: RichAction,
) -> Result<RichLocalOutcome, BreditorError> {
    owner
        .dispatch(snapshot, &[action], RichSelectionUpdate::Map)
        .map_err(|value| error::session(&value))
}
