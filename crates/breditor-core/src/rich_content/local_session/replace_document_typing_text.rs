//! First-key whole-document replacement starts a native burst without joining preceding input.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    typing_history::{Kind, separator},
};
use crate::{
    document::FormatSet,
    rich_content::{BlockId, RichSelectionError, RichSelectionKind},
};
impl RichLocalSession {
    /// Replace an explicit document scope with plain user input; later caret typing may join it.
    /// Empty input validates guards/mode/scope but publishes nothing. Recovery starts a new burst.
    /// # Errors
    /// Stale/read-only/disabled, wrong scope, reused IDs, invalid input and limits are atomic.
    pub fn replace_document_typing_text(
        &mut self,
        snapshot: &RichLocalSnapshot,
        paragraph: &BlockId,
        text: &str,
        clock_ms: u64,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if !self.typing_history_enabled() {
            return Err(RichLocalSessionError::TypingHistoryDisabled);
        }
        if !matches!(
            self.state.selection.as_ref().map(crate::rich_content::RichSelection::kind),
            Some(RichSelectionKind::Document)
        ) {
            return Err(RichSelectionError::TargetKind.into());
        }
        if text.is_empty() {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let result = self.replace_document_plain_text(snapshot, paragraph, text)?;
        if result == RichLocalOutcome::ContentCommitted {
            self.typing_after(false, Kind::Insert, clock_ms, FormatSet::default(), separator(text));
        }
        Ok(result)
    }
}
