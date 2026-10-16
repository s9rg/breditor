//! Guarded selection-only structural movement; content/history and Redo stay intact.
use super::{RichLocalOutcome, RichLocalSession, RichLocalSessionError, RichLocalSnapshot};
use crate::rich_content::{FlowMove, FlowNavigationOutcome};

impl RichLocalSession {
    /// Move to an adjacent logical flow stop without authoring content or requiring writable policy.
    ///
    /// Null, ranged, grid, interior and boundary selections publish nothing.
    /// Actual movement uses the ordinary selection publication, clearing only
    /// context-dependent pending styles and closing native typing continuation.
    /// # Errors
    /// Stale/foreign observations, invalid source proof or failed publication leave all fields intact.
    pub fn navigate_flow(
        &mut self,
        snapshot: &RichLocalSnapshot,
        movement: FlowMove,
    ) -> Result<RichLocalOutcome, RichLocalSessionError> {
        self.check(snapshot)?;
        let Some(selection) = self.state.selection.as_ref() else {
            return Ok(RichLocalOutcome::Unchanged);
        };
        match crate::rich_content::navigate_flow(&self.state.document, selection, movement)? {
            FlowNavigationOutcome::Moved(selection) => {
                self.set_selection(snapshot, Some(selection.kind().clone()))
            }
            FlowNavigationOutcome::NotApplicable | FlowNavigationOutcome::Boundary(_) => {
                Ok(RichLocalOutcome::Unchanged)
            }
        }
    }
}
