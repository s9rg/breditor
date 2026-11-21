//! Payload-redacting rich boundary diagnostics, never source text or codec reports.

use crate::BreditorError;
use breditor_core::rich_content::RichLocalSessionError;

pub(super) const fn rejected(code: &'static str) -> BreditorError {
    BreditorError::new(code, "the rich editor request was rejected")
}
pub(super) fn session(error: &RichLocalSessionError) -> BreditorError {
    let code = match error {
        RichLocalSessionError::ReadOnly => "breditor_rich.read_only",
        RichLocalSessionError::Restricted => "breditor_rich.restricted",
        RichLocalSessionError::TypingHistoryDisabled => "breditor_rich.typing_history_disabled",
        RichLocalSessionError::StaleSnapshot => "breditor_rich.stale_observation",
        RichLocalSessionError::Revision(_) => "breditor_rich.revision_overflow",
        RichLocalSessionError::TriggerStep => "breditor_rich.trigger_step",
        _ => "breditor_rich.command_rejected",
    };
    rejected(code)
}
