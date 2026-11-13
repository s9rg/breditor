//! Explicit same-writer continuation of an admitted V1 history.
use super::super::{RichReplica, SharedObservation};
use crate::Error;

impl RichReplica {
    /// Seal the current V1 file and select a larger bounded history archive.
    /// Keeps the original writer, causal inputs, Undo/Redo, and receipts.
    ///
    /// # Errors
    /// A stale observation, wrong policy, reused generation, or unadmitted
    /// checkpoint leaves the current owner and original archive intact.
    pub fn continue_history_guarded(
        &mut self,
        observed: &SharedObservation,
        next_generation: String,
    ) -> Result<(), Error> {
        self.check(observed)?;
        self.require_writable()?;
        let state = self.segmented.as_ref().ok_or(Error::Contract("segmented history required"))?;
        if state.continuation.is_some() {
            return Err(Error::Contract("document history already continued"));
        }
        let next = state.seal_for(self, next_generation, Some(state.sealed.len() + 1))?;
        let mut candidate = self.staged()?;
        candidate.segmented = Some(next);
        candidate.enable_continued_undo()?;
        self.adopt(candidate)
    }
}
