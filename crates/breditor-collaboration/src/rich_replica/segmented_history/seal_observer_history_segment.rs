//! Seal-observer-history-segment/v1: archive imported history without enabling local editing.
use super::super::{RichReplica, SharedObservation};
use crate::Error;

impl RichReplica {
    /// Seal a nonempty observer segment under a lifetime-new opaque generation ID.
    ///
    /// Requires both the live read-only gate and an actual zero native authored prefix.
    /// No content operation, permission change, writer receipt or history reset is produced.
    /// Imported causal atoms, pending imports, UI/formats and all Undo/Redo remain exact;
    /// the explicit boundary closes natural typing without repartitioning existing groups.
    /// This local archive operation grants no relay authority or durable acknowledgement.
    /// The original writable seal-history-segment/v1 contract remains unchanged.
    /// # Errors
    /// Stale/foreign observations, writable or previously authored owners, disabled mode,
    /// empty segments, reused IDs and replay/archive bounds reject atomically. Tests cover
    /// cold recovery across native language/scope/history policies and permission failures.
    pub fn seal_observer_history_segment_guarded(
        &mut self,
        observed: &SharedObservation,
        next_generation: String,
    ) -> Result<(), Error> {
        self.check(observed)?;
        if !self.is_read_only() {
            return Err(Error::Contract("observer history sealing requires read-only policy"));
        }
        if self.writer_clock_v2(self.writer())?.through != "0" {
            return Err(Error::Contract("observer history sealing requires zero authored prefix"));
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
