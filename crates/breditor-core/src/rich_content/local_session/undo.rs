//! Exact local undo with saved source selection, never reverse-fallback inference.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
};
use crate::rich_content::actions::apply_batch;

impl RichLocalSession {
    /// Undo one explicit group against an exact live-owner observation.
    ///
    /// # Errors
    /// Rejects stale observations, mismatched boundaries, failed inverse replay
    /// or revision overflow without moving the history cursor or selection.
    pub fn undo(
        &mut self,
        snapshot: &RichLocalSnapshot,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        let Some(index) = self.cursor.checked_sub(1) else {
            return Ok(RichLocalOutcome::Unchanged);
        };
        let entry = &self.entries[index];
        if self.state.document.document() != entry.after.document.document() {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        let edit = apply_batch(&self.context, &self.state.document, &entry.inverse)?
            .ok_or(RichLocalSessionError::HistoryMismatch)?;
        if edit.document().document() != entry.before.document.document() {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        let candidate = RichLocalState::try_new(
            &self.context,
            edit.into_parts().0,
            entry.before.selection.as_ref().map(|selection| selection.kind().clone()),
            self.state.revision.successor()?,
        )?;
        self.cursor = index;
        self.publish(candidate);
        Ok(RichLocalOutcome::UndoApplied)
    }
}
