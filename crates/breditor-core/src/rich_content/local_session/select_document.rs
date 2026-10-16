//! Explicit Select All scope, independent from the existence or order of text endpoints.
use super::{RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
use crate::rich_content::RichSelectionKind;
impl RichLocalSession {
    /// Select the complete current document without creating Undo or discarding Redo.
    /// Read-only owners may select. The separate document-selection codec retains this scope.
    /// # Errors
    /// Rejects stale/foreign observations or revision exhaustion without changing state.
    pub fn select_document(
        &mut self,
        snapshot: &RichLocalSnapshot,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.set_selection(snapshot, Some(RichSelectionKind::Document))
    }
}
