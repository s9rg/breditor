use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError, BreditorObservation};

use super::{BreditorSelection, BreditorSelectionResult};

#[wasm_bindgen]
impl BreditorEngine {
    /// Reads the semantic selection at one exact guarded engine observation.
    #[must_use]
    pub fn selection(&self, expected: &BreditorObservation) -> BreditorSelectionResult {
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorSelectionResult::from_error(BreditorError::checkpointed_engine(&error));
        }
        match BreditorSelection::from_state(self.inner.state()) {
            Ok(selection) => BreditorSelectionResult::success(selection),
            Err(error) => BreditorSelectionResult::from_error(error),
        }
    }
}
