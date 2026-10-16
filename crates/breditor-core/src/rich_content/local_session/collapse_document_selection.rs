//! Guarded selection-only whole-document collapse; content and both history stacks stay exact.
use super::{RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
use crate::rich_content::{FlowMove, FlowNavigationOutcome};
impl RichLocalSession {
    /// Collapse whole-document scope to its native logical edge. Read-only owners may navigate.
    /// No visible destination and non-document scope publish nothing; no recovery paragraph is born.
    /// # Errors
    /// Stale/foreign proofs and failed publication retain all native state and observation.
    pub fn collapse_document_selection(
        &mut self,
        snapshot: &RichLocalSnapshot,
        side: FlowMove,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        let Some(selection) = self.state.selection.as_ref() else {
            return Ok(RichLocalOutcome::Unchanged);
        };
        match crate::rich_content::collapse_document_selection(
            &self.state.document,
            selection,
            side,
        )? {
            FlowNavigationOutcome::Moved(stop) => {
                self.set_selection(snapshot, Some(stop.kind().clone()))
            }
            FlowNavigationOutcome::Boundary(_) | FlowNavigationOutcome::NotApplicable => {
                Ok(RichLocalOutcome::Unchanged)
            }
        }
    }
}
