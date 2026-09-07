use breditor_core::action::{ActionId, ActionInvocation};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorCommandResult, BreditorEngine, BreditorError, BreditorObservation,
    command::supports_string_input,
    error::{
        ACTION_REQUIRES_STRING_CODE, INVALID_ACTION_ID_CODE, UNKNOWN_ACTION_CODE,
        UNSUPPORTED_ACTION_INPUT_CODE,
    },
};

#[wasm_bindgen]
impl BreditorEngine {
    /// Executes one registered action whose descriptor accepts no input.
    ///
    /// The observation is checked before action parsing and checked again by
    /// the authoritative core mutation. Domain rejection is returned in the
    /// structured result for live typed handles.
    #[wasm_bindgen(js_name = executeNoInputAction)]
    pub fn execute_no_input_action(
        &mut self,
        expected: &BreditorObservation,
        action_id: &str,
    ) -> BreditorCommandResult {
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorCommandResult::from_error(
                self,
                BreditorError::checkpointed_engine(&error),
            );
        }
        let Ok(action_id) = ActionId::try_new(action_id) else {
            return BreditorCommandResult::from_error(
                self,
                BreditorError::new(INVALID_ACTION_ID_CODE, "the action identity is invalid"),
            );
        };
        let Some(descriptor) = self.inner.action_registry().descriptor(&action_id) else {
            return BreditorCommandResult::from_error(
                self,
                BreditorError::new(UNKNOWN_ACTION_CODE, "the action is not registered"),
            );
        };
        if let Some(contract) = descriptor.input_contract() {
            if supports_string_input(&action_id, contract) {
                return BreditorCommandResult::from_error(
                    self,
                    BreditorError::new(
                        ACTION_REQUIRES_STRING_CODE,
                        "the action requires string input",
                    ),
                );
            }
            return BreditorCommandResult::from_error(
                self,
                BreditorError::new(
                    UNSUPPORTED_ACTION_INPUT_CODE,
                    "the action input shape is not supported by this Wasm ABI",
                ),
            );
        }

        let invocation = ActionInvocation::without_input(action_id);
        match self.inner.execute_action(expected.inner(), &invocation) {
            Ok(outcome) => BreditorCommandResult::from_action_outcome(self, outcome),
            Err(error) => {
                BreditorCommandResult::from_error(self, BreditorError::checkpointed_engine(&error))
            }
        }
    }
}
