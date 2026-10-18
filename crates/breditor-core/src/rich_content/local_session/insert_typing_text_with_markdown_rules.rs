//! Natural typing continuation with exclusive, separately undoable shortcut recognition.
use super::{RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
use crate::rich_content::RichInputRuleOutcome;

impl RichLocalSession {
    /// Type and recognize without yielding to host callbacks between publications.
    ///
    /// No match keeps the natural typing burst open. A conversion isolates its
    /// original native action group, so Undo restores the complete literal input.
    /// `Refused` means typing committed and must never be retried.
    /// # Errors
    /// Stale/read-only/disabled owners or failed literal typing publish nothing.
    pub fn insert_typing_text_with_markdown_rules(
        &mut self,
        snapshot: &RichLocalSnapshot,
        text: &str,
        clock_ms: u64,
        namespace: &str,
    ) -> Result<RichInputRuleOutcome, RichLocalSessionError> {
        let outcome = self.insert_typing_text(snapshot, text, clock_ms)?;
        Ok(self.finish_markdown_input_rule(outcome, text, namespace))
    }
}
