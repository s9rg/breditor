//! Named user typing only: native explicit groups retain every original forward event.
use super::{
    RichReplica, SharedObservation,
    typing_history::{Kind, separator},
};
use crate::Error;
impl RichReplica {
    /// Insert collapsed-caret user input with monotonic timing hints and native grouping.
    /// Paste, replacement, composition and programmatic edits use existing explicit APIs.
    /// Line separators isolate both sides; empty input retains active continuation.
    /// # Errors
    /// Rejects stale/read-only/disabled, non-caret, malformed text or failed staged publication.
    pub fn insert_typing_text_guarded(
        &mut self,
        observation: &SharedObservation,
        text: &str,
        clock_ms: u64,
    ) -> Result<bool, Error> {
        self.check(observation)?;
        self.require_writable()?;
        let mut request = self.typing_before(Kind::Insert, clock_ms)?;
        if text.is_empty() {
            return Ok(false);
        }
        request.isolated = separator(text);
        if request.isolated {
            request.join = false;
        }
        let selection = self.selection()?.ok_or(Error::Contract("shared typing requires caret"))?;
        let point = selection.caret().ok_or(Error::Contract("shared typing requires caret"))?;
        let (commands, selection, pending) = self.plan_plain_caret_input(text, point)?;
        self.apply_with_state_inner(commands, selection, pending, Some(request))
    }
}
