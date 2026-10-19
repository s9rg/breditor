//! Native seal-history-segment/v1: exact immutable input segment, not a history reset or storage CAS.
use super::super::{RichReplica, SharedObservation};
use crate::Error;
impl RichReplica {
    /// Seal a nonempty active segment and begin a lifetime-new opaque segment identity.
    /// Native causal atoms, pending imports, all current Undo/Redo, selection and formats remain.
    /// A natural group closes at the explicit boundary; no group is silently repartitioned.
    /// Host persistence and exclusive writer ownership remain separate obligations.
    /// # Errors
    /// Stale/foreign/read-only owners, disabled mode, empty segment, reused IDs and bounded
    /// replay/archive failures preserve the original complete segmented checkpoint atomically.
    pub fn seal_history_segment_guarded(
        &mut self,
        observed: &SharedObservation,
        next_generation: String,
    ) -> Result<(), Error> {
        self.check(observed)?;
        self.require_writable()?;
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
