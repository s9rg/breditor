//! Explicit native generation recovery for an unpublished suggestion effect, never a final decision.
use super::PreparedDocumentSuggestionEffect;
use crate::Error;

impl PreparedDocumentSuggestionEffect {
    /// Retain the complete staged native generation archive without publishing or flattening it.
    /// The owner must have selected generations explicitly. The original getter remains separate.
    /// # Errors
    /// An original candidate or any native file, archive or retained-history budget refuses.
    pub fn segmented_checkpoint(&self) -> Result<String, Error> {
        self.candidate.segmented_checkpoint()
    }
}
