//! Native lifecycle action `review.history.observer_enable/1`. It retains a zero-authored
//! stream under current read-only policy; neither saved files nor this action unlock it.
use super::{
    super::{ReviewError, ReviewObservation, ReviewSession},
    enable_segmented_history::enable,
};

impl ReviewSession {
    /// Select independent history for a currently read-only, non-authoring observer.
    /// # Errors
    /// Writable policy, any retained local author prefix, or ordinary enable failures reject.
    pub fn enable_observer_segmented_history_guarded(
        &mut self,
        observed: &ReviewObservation,
        root: String,
        active: String,
    ) -> Result<(), ReviewError> {
        enable(self, observed, root, active, true)
    }
}
