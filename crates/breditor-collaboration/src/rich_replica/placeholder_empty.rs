use super::{RichReplica, SharedObservation};
use crate::Error;
use breditor_core::rich_content::is_rich_placeholder_empty;

impl RichReplica {
    /// Read accepted document-level prompt eligibility at this exact publication.
    /// Read-only owners remain readable; host policy decides whether to display it.
    /// # Errors
    /// Rejects stale or foreign observations before inspecting the admitted AST.
    pub fn placeholder_empty_guarded(&self, observed: &SharedObservation) -> Result<bool, Error> {
        self.check(observed)?;
        Ok(is_rich_placeholder_empty(self.document()))
    }
}
