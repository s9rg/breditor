//! Explicit candidate recovery for a receiver already selecting native history generations.
use super::PreparedWriterGroup;
use crate::Error;

impl PreparedWriterGroup {
    /// Read the exact admitted generation archive before the host's append-before-publish step.
    /// It retains original root/sealed files, pending inputs, UI and native Undo/Redo. This read
    /// neither switches family nor claims durability; the original checkpoint getter still refuses.
    /// # Errors
    /// An original candidate, invalid native retention or existing archive/file budgets reject.
    pub fn segmented_checkpoint(&self) -> Result<String, Error> {
        self.candidate.segmented_checkpoint()
    }

    /// Save an unpublished candidate using the explicit continuation format.
    ///
    /// # Errors
    /// Refuses a legacy candidate or an invalid continued archive.
    pub fn continued_history_checkpoint(&self) -> Result<String, Error> {
        self.candidate.continued_history_checkpoint()
    }
}
