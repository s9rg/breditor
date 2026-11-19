//! Strict candidate-V4 text-language intent over the native selection (set or clear).
use crate::{BreditorError, rich_editor::error};
use breditor_core::{
    codec::decode_rich_text_language_command,
    rich_content::{RichLocalOutcome, RichLocalSession, RichLocalSnapshot},
};
pub(super) fn execute(
    owner: &mut RichLocalSession,
    observation: &RichLocalSnapshot,
    input: &str,
) -> Result<RichLocalOutcome, BreditorError> {
    let language = decode_rich_text_language_command(owner.context(), input)
        .map_err(|_| error::rejected("breditor_rich.text_language_intent"))?;
    owner.set_text_language(observation, language.as_ref()).map_err(|e| error::session(&e))
}
