//! Exact local undo with saved source selection, never reverse-fallback inference.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
};

impl RichLocalSession {
    /// Undo one native history unit against an exact live-owner observation.
    ///
    /// By default this is one explicit dispatch. When natural history is enabled,
    /// every inverse in the current unit is checked before one atomic publication.
    ///
    /// # Errors
    /// Rejects stale observations, mismatched boundaries, failed inverse replay
    /// or revision overflow without moving the history cursor or selection.
    pub fn undo(
        &mut self,
        snapshot: &RichLocalSnapshot,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if self.cursor == 0 {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let index = self.undo_group_start()?;
        let mut document = self.state.document.clone();
        for step in self.entries[index..self.cursor].iter().rev() {
            if document.document() != step.after.document.document() {
                return Err(RichLocalSessionError::HistoryMismatch);
            }
            document = step.inverse.apply(&self.context, &document)?;
            if document.document() != step.before.document.document() {
                return Err(RichLocalSessionError::HistoryMismatch);
            }
        }
        let entry = &self.entries[index];
        let candidate = RichLocalState::try_new(
            &self.context,
            document,
            entry.before.selection.as_ref().map(|selection| selection.kind().clone()),
            entry.before.pending_formats.clone(),
            self.state.revision.successor()?,
        )?;
        self.cursor = index;
        self.probe.undos = self.probe.undos.wrapping_add(1);
        self.publish(candidate);
        Ok(RichLocalOutcome::UndoApplied)
    }
}
