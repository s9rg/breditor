use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorCommandResult, BreditorEngine, BreditorError, BreditorObservation};

#[wasm_bindgen]
impl BreditorEngine {
    /// Replays the nearest undo entry after exact observation checks.
    ///
    /// Unavailable undo is an `unchanged` outcome. Domain rejection is returned
    /// in the structured result for live typed handles.
    pub fn undo(&mut self, expected: &BreditorObservation) -> BreditorCommandResult {
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorCommandResult::from_error(
                self,
                BreditorError::checkpointed_engine(&error),
            );
        }
        match self.inner.undo(expected.inner()) {
            Ok(event) => {
                let observation = self.inner.observation();
                BreditorCommandResult::from_optional_event(self, event, observation)
            }
            Err(error) => {
                BreditorCommandResult::from_error(self, BreditorError::checkpointed_engine(&error))
            }
        }
    }
}
