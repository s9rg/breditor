use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorCommandResult, BreditorEngine, BreditorError, BreditorObservation};

#[wasm_bindgen]
impl BreditorEngine {
    /// Clears the semantic selection at one exact guarded observation.
    #[wasm_bindgen(js_name = clearSelection)]
    pub fn clear_selection(&mut self, expected: &BreditorObservation) -> BreditorCommandResult {
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorCommandResult::from_error(
                self,
                BreditorError::checkpointed_engine(&error),
            );
        }
        match self.inner.set_selection(expected.inner(), None) {
            Ok(event) => {
                BreditorCommandResult::from_optional_event(self, event, self.inner.observation())
            }
            Err(error) => {
                BreditorCommandResult::from_error(self, BreditorError::checkpointed_engine(&error))
            }
        }
    }
}
