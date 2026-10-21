//! Lifecycle `document.history.read_only_seal/1`: an archive boundary is not an edit grant.
use super::super::{RichReplica, SharedObservation};
use crate::Error;

impl RichReplica {
    /// Retain a nonempty suffix while a former author remains currently read-only.
    /// Past local operations, received atoms, pending inputs, both history branches,
    /// selection and pending formats remain. No event, counter or permission changes.
    /// Natural typing closes at this explicit boundary without repartitioning old groups.
    /// Original writable and zero-authored observer sealing contracts remain unchanged.
    /// # Errors
    /// Stale/foreign guards, writable policy, disabled mode, empty/reused/malformed
    /// generations and native replay/archive limits reject without publication.
    pub fn seal_read_only_history_segment_guarded(
        &mut self,
        observed: &SharedObservation,
        next_generation: String,
    ) -> Result<(), Error> {
        self.check(observed)?;
        if !self.is_read_only() {
            return Err(Error::Contract("read-only history lifecycle requires read-only policy"));
        }
        let state = self
            .segmented
            .as_ref()
            .ok_or(Error::Contract("segmented history required"))?
            .seal(self, next_generation)?;
        let mut candidate = self.staged()?;
        candidate.segmented = Some(state);
        self.adopt(candidate)
    }
}
