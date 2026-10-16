//! First-key atom replacement starts, but never joins, a natural input burst.
use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot,
    typing_history::{Kind, separator},
};
use crate::{
    document::FormatSet,
    rich_content::{BlockId, RichSelectionError, selected_flow_atom},
};
impl RichLocalSession {
    /// Replace a whole atom with plain user typing and continue in the same native Undo unit.
    ///
    /// Requires separately enabled typing history. A nonempty first key starts
    /// a new burst; subsequent ordinary caret typing may join it. Empty input
    /// proves the source but changes nothing and does not consume the paragraph ID.
    /// Recovery never restores a process-local continuation clock.
    /// # Errors
    /// Stale/read-only/disabled, non-atoms, reused IDs and invalid input publish nothing.
    pub fn replace_atom_typing_text(
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
        selected_flow_atom(
            &self.state.document,
            self.state.selection.as_ref().ok_or(RichSelectionError::TargetKind)?,
        )?;
        if text.is_empty() {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let outcome = self.replace_atom_plain_text(snapshot, paragraph, text)?;
        if outcome == RichLocalOutcome::ContentCommitted {
            self.typing_after(false, Kind::Insert, clock_ms, FormatSet::default(), separator(text));
        }
        Ok(outcome)
    }
}
