use breditor_core::action::{ActionId, ActionInput, ActionInvocation, ActionValue};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorCommandResult, BreditorEngine, BreditorError, BreditorObservation,
    command::supports_string_input,
    error::{
        ACTION_REJECTS_STRING_CODE, INVALID_ACTION_ID_CODE, STRING_INPUT_LIMIT_CODE,
        UNKNOWN_ACTION_CODE, UNSUPPORTED_ACTION_INPUT_CODE,
    },
};

#[wasm_bindgen]
impl BreditorEngine {
    /// Executes one registered string-input action.
    ///
    /// The adapter derives the exact registered input contract instead of
    /// allowing JavaScript to choose a contract or version. The observation is
    /// checked before input admission and checked again by the core mutation.
    /// Domain rejection is returned in the structured result for live typed
    /// handles.
    #[wasm_bindgen(js_name = executeStringAction)]
    pub fn execute_string_action(
        &mut self,
        expected: &BreditorObservation,
        action_id: &str,
        value: &str,
        close_history_group_before: bool,
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
        let contract = match self.inner.action_registry().descriptor(&action_id) {
            Some(descriptor) => match descriptor.input_contract() {
                Some(contract) if supports_string_input(&action_id, contract) => contract.clone(),
                Some(_) => {
                    return BreditorCommandResult::from_error(
                        self,
                        BreditorError::new(
                            UNSUPPORTED_ACTION_INPUT_CODE,
                            "the action input shape is not supported by this Wasm ABI",
                        ),
                    );
                }
                None => {
                    return BreditorCommandResult::from_error(
                        self,
                        BreditorError::new(
                            ACTION_REJECTS_STRING_CODE,
                            "the action does not accept string input",
                        ),
                    );
                }
            },
            None => {
                return BreditorCommandResult::from_error(
                    self,
                    BreditorError::new(UNKNOWN_ACTION_CODE, "the action is not registered"),
                );
            }
        };
        let Ok(value) = ActionValue::try_from_string(value) else {
            return BreditorCommandResult::from_error(
                self,
                BreditorError::new(
                    STRING_INPUT_LIMIT_CODE,
                    "the string action input exceeds its boundary limit",
                ),
            );
        };
        let invocation = ActionInvocation::new(action_id, ActionInput::typed(contract, value));
        let outcome = if close_history_group_before {
            self.inner
                .execute_action_after_closing_history_group(expected.inner(), &invocation)
                .map(|sequence| BreditorCommandResult::from_action_sequence(self, sequence))
        } else {
            self.inner
                .execute_action(expected.inner(), &invocation)
                .map(|outcome| BreditorCommandResult::from_action_outcome(self, outcome))
        };
        match outcome {
            Ok(result) => result,
            Err(error) => {
                BreditorCommandResult::from_error(self, BreditorError::checkpointed_engine(&error))
            }
        }
    }
}
