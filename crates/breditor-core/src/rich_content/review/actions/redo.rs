//! Redo restores the original review contribution, never overwrites a later peer value.
use super::super::{ReviewError, ReviewObservation, ReviewOutcome, ReviewSession};
impl ReviewSession {
    /// Redo one retained review contribution under current host authority.
    /// # Errors
    /// Stale observations, revoked permission or resource failures reject atomically.
    pub fn redo(&mut self, observed: &ReviewObservation) -> Result<ReviewOutcome, ReviewError> {
        self.history_step(observed, true)
    }
}
