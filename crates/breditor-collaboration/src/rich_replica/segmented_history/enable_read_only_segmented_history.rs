//! Lifecycle `document.history.read_only_enable/1`: retain actual former-author history.
//! No content/selection/format action, policy grant, counter reset or storage I/O occurs.
use super::super::{RichReplica, SharedObservation};
use super::state::{Root, SegmentedHistory};
use crate::Error;

impl RichReplica {
    /// Select native archive generations while retaining current read-only and past author inputs.
    /// Configure scope, typing, search and reviewed policies first. Natural typing closes at
    /// this explicit boundary; no retained group, native operation or Undo branch is removed.
    /// This grants no writer, provider, relay or storage-publication authority.
    /// # Errors
    /// Stale/foreign guards, writable policy, existing segmentation, malformed/reused IDs
    /// and native replay/archive limits leave the original owner untouched.
    pub fn enable_read_only_segmented_history_guarded(
        &mut self,
        observed: &SharedObservation,
        root_generation: String,
        active_generation: String,
    ) -> Result<(), Error> {
        self.check(observed)?;
        if !self.is_read_only() {
            return Err(Error::Contract("read-only history lifecycle requires read-only policy"));
        }
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
