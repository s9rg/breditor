//! Native segmented-history/v1 admission. No document operation, storage I/O or writer rollover.
use super::super::{RichReplica, SharedObservation};
use super::state::{Root, SegmentedHistory};
use crate::Error;

impl RichReplica {
    /// Select the separate segmented recovery contract and retain the complete old checkpoint.
    /// Both opaque generation IDs must be distinct valid IDs. Scope, typing, reviewed and search
    /// modes are pinned at this boundary; configure them first. This closes a live typing group,
    /// preserves native operations, UI, Undo/Redo and pending imports, and advances observation.
    /// This performs no storage publication and grants no writer/provider authority.
    /// # Errors
    /// Stale/foreign/read-only owners, repeated enable, IDs, replay or archive limits leave the
    /// original owner and its old-family checkpoint intact. Old save methods refuse the new mode.
    pub fn enable_segmented_history_guarded(
        &mut self,
        observed: &SharedObservation,
        root_generation: String,
        active_generation: String,
    ) -> Result<(), Error> {
        self.check(observed)?;
        self.require_writable()?;
        if self.segmented.is_some() {
            return Err(Error::Contract("segmented history already enabled"));
        }
        let root = Root::capture(self, root_generation)?;
        let state = SegmentedHistory::new(root, active_generation)?;
        let mut candidate = self.staged()?;
        candidate.segmented = Some(state);
        candidate.undo.enable_staging_group_tracking();
        self.adopt(candidate)
    }
}
