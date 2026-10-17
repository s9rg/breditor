//! Undo hides one locally owned original contribution; peer replies and edits remain independent.
use super::super::{ReviewError, ReviewObservation, ReviewOutcome, ReviewSession};
impl ReviewSession {
    /// Undo one review contribution without modifying accepted document content.
    /// # Errors
    /// Stale observations, revoked permission or resource failures leave both histories unchanged.
    pub fn undo(&mut self, observed: &ReviewObservation) -> Result<ReviewOutcome, ReviewError> {
        self.history_step(observed, false)
    }
}
