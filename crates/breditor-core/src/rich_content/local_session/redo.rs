//! Exact local redo from retained guarded forward actions and saved after selection.

use super::{
    RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot, RichLocalState,
};
use crate::rich_content::actions::apply_batch;

impl RichLocalSession {
    /// Redo one explicit group, preserving exact bodies, IDs, metadata and selection.
    ///
    /// # Errors
    /// Rejects stale observations, mismatched boundaries, failed forward replay
    /// or revision overflow without moving the history cursor or selection.
    pub fn redo(
        &mut self,
        snapshot: &RichLocalSnapshot,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        let Some(entry) = self.entries.get(self.cursor) else {
            return Ok(RichLocalOutcome::Unchanged);
        };
        if self.state.document.document() != entry.before.document.document() {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        let edit = apply_batch(&self.context, &self.state.document, &entry.forward)?
            .ok_or(RichLocalSessionError::HistoryMismatch)?;
        if edit.document().document() != entry.after.document.document() {
            return Err(RichLocalSessionError::HistoryMismatch);
        }
        let candidate = RichLocalState::try_new(
            &self.context,
            edit.into_parts().0,
            entry.after.selection.as_ref().map(|selection| selection.kind().clone()),
            entry.after.pending_formats.clone(),
            self.state.revision.successor()?,
        )?;
        self.cursor += 1;
        self.publish(candidate);
        Ok(RichLocalOutcome::RedoApplied)
    }
}
