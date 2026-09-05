use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorCommandResult, BreditorEngine, BreditorError, BreditorObservation};

#[wasm_bindgen]
impl BreditorEngine {
    /// Replays the nearest redo entry after exact observation checks.
    ///
    /// Unavailable redo is an `unchanged` outcome. Domain rejection is returned
    /// in the structured result for live typed handles.
    pub fn redo(&mut self, expected: &BreditorObservation) -> BreditorCommandResult {
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorCommandResult::from_error(BreditorError::engine(&error));
        }
        match self.inner.redo(expected.inner()) {
            Ok(event) => {
                let observation = self.inner.observation();
                BreditorCommandResult::from_optional_event(event, observation)
            }
            Err(error) => BreditorCommandResult::from_error(BreditorError::engine(&error)),
        }
    }
}
