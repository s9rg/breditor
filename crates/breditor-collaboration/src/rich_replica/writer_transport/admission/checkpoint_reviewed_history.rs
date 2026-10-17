//! Save an admitted transport candidate without falling back to an old history family.
use super::PreparedWriterGroup;
use crate::Error;
impl PreparedWriterGroup {
    /// Exact reviewed candidate recovery for a receiver that explicitly enabled that contract.
    /// This does not authenticate, append, commit or acknowledge the received writer group.
    /// # Errors
    /// Disabled reviewed history, retained-history admission or the whole-save budget rejects.
    pub fn reviewed_checkpoint(&self) -> Result<String, Error> {
        self.candidate.reviewed_checkpoint()
    }
}
