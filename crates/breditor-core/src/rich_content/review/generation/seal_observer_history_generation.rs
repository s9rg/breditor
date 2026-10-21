//! Native lifecycle action `review.history.observer_seal/1`. Receiving peer events
//! can fill an observer generation; sealing retains current read-only and zero authored prefix.
use super::{
    super::{ReviewError, ReviewObservation, ReviewSession},
    seal_history_generation::seal,
};

impl ReviewSession {
    /// Seal received comment inputs without granting the observer authoring rights.
    /// # Errors
    /// Writable/nonzero local streams and ordinary exact seal failures reject atomically.
    pub fn seal_observer_history_generation_guarded(
        &mut self,
        observed: &ReviewObservation,
        next: String,
    ) -> Result<(), ReviewError> {
        seal(self, observed, next, true)
    }
}
