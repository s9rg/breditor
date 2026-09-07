use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError, BreditorObservation};

use super::{BreditorProjection, BreditorProjectionResult};

#[wasm_bindgen]
impl BreditorEngine {
    /// Reads a deterministic non-JSON view of the exact current document.
    ///
    /// The complete engine, snapshot, and history observation is checked before
    /// projection. A stale observation returns a structured, payload-redacting
    /// error and the engine remains unchanged.
    #[must_use]
    pub fn projection(&self, expected: &BreditorObservation) -> BreditorProjectionResult {
        let generation = self.generation.clone();
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorProjectionResult::from_error(
                generation,
                BreditorError::checkpointed_engine(&error),
            );
        }
        let projection = BreditorProjection::from_state(generation.clone(), self.inner.state());
        BreditorProjectionResult::success(generation, projection)
    }
}
