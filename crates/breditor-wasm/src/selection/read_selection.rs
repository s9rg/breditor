use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError, BreditorObservation};

use super::{BreditorSelection, BreditorSelectionResult};

#[wasm_bindgen]
impl BreditorEngine {
    /// Reads the semantic selection at one exact guarded engine observation.
    #[must_use]
    pub fn selection(&self, expected: &BreditorObservation) -> BreditorSelectionResult {
        let generation = self.generation.clone();
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorSelectionResult::from_error(
                generation,
                BreditorError::checkpointed_engine(&error),
            );
        }
        match BreditorSelection::from_state(generation.clone(), self.inner.state()) {
            Ok(selection) => BreditorSelectionResult::success(generation, selection),
            Err(error) => BreditorSelectionResult::from_error(generation, error),
        }
    }
}
