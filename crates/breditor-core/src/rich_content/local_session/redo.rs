//! Exact local redo from retained guarded forward actions and saved after selection.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
};

impl RichLocalSession {
    /// Redo one native history unit, preserving exact bodies, IDs, metadata and selection.
    ///
    /// Natural history replays all original records before one atomic publication;
    /// an ordinary owner still redoes exactly one explicit dispatch.
    ///
    /// # Errors
    /// Rejects stale observations, mismatched boundaries, failed forward replay
    /// or revision overflow without moving the history cursor or selection.
    pub fn redo(
        &mut self,
        snapshot: &RichLocalSnapshot,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        self.require_writable()?;
        if self.cursor == self.entries.len() {
            return Ok(RichLocalOutcome::Unchanged);
        }
        let end = self.redo_group_end()?;
        let mut document = self.state.document.clone();
        for step in &self.entries[self.cursor..end] {
            if document.document() != step.before.document.document() {
                return Err(RichLocalSessionError::HistoryMismatch);
            }
            document = step.forward.apply(&self.context, &document)?;
            if document.document() != step.after.document.document() {
                return Err(RichLocalSessionError::HistoryMismatch);
            }
        }
        let entry = &self.entries[end - 1];
        let candidate = RichLocalState::try_new(
            &self.context,
            document,
            entry.after.selection.as_ref().map(|selection| selection.kind().clone()),
            entry.after.pending_formats.clone(),
            self.state.revision.successor()?,
        )?;
        self.cursor = end;
        self.publish(candidate);
        Ok(RichLocalOutcome::RedoApplied)
    }
}
