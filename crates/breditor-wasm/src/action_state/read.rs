use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError, BreditorObservation};

use super::BreditorActionStatesResult;

#[wasm_bindgen]
impl BreditorEngine {
    /// Refreshes the complete profile action-state catalog at one guarded engine instant.
    ///
    /// The exact engine, snapshot, and history observation is checked before
    /// the cache is consulted. A stale read cannot mutate the cache. A
    /// successful result owns a complete immutable non-JSON snapshot and says
    /// whether it is a full baseline, an exact cache hit, or a prior-relative
    /// delta. The snapshot is presentation-independent: labels, icons, toolbar
    /// ordering, and click dispatch remain host concerns.
    #[must_use]
    #[wasm_bindgen(js_name = actionStates)]
    pub fn action_states(&mut self, expected: &BreditorObservation) -> BreditorActionStatesResult {
        let generation = self.generation.clone();
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorActionStatesResult::from_error(
                generation,
                BreditorError::checkpointed_engine(&error),
            );
        }
        match self.action_states.refresh(self.inner.session()) {
            Ok(update) => BreditorActionStatesResult::from_update(generation, &update),
            Err(_) => BreditorActionStatesResult::from_error(
                generation,
                BreditorError::action_state_read(),
            ),
        }
    }
}
