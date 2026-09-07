use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorCommandResult, BreditorEngine, BreditorError, BreditorObservation};

#[wasm_bindgen]
impl BreditorEngine {
    /// Closes an open history merge group after exact observation checks.
    ///
    /// A repeated close is an `unchanged` outcome. Domain rejection is returned
    /// in the structured result for live typed handles.
    #[wasm_bindgen(js_name = closeHistoryGroup)]
    pub fn close_history_group(&mut self, expected: &BreditorObservation) -> BreditorCommandResult {
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorCommandResult::from_error(
                self,
                BreditorError::checkpointed_engine(&error),
            );
        }
        match self.inner.close_history_group(expected.inner()) {
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
