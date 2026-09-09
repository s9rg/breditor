use breditor_core::action::routing::{IntentId, IntentInvocation};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorEngine, BreditorError, BreditorIntentResult, BreditorObservation,
    error::{INTENT_REQUIRES_INPUT_CODE, INVALID_INTENT_ID_CODE},
};

#[wasm_bindgen]
impl BreditorEngine {
    /// Executes one declared semantic intent whose exact input contract is none.
    ///
    /// Observation admission happens before the untrusted intent identity is
    /// parsed. The core repeats the complete guard while routing and consuming
    /// the cached route exactly once.
    #[must_use]
    #[wasm_bindgen(js_name = executeNoInputIntent)]
    pub fn execute_no_input_intent(
        &mut self,
        expected: &BreditorObservation,
        intent_id: &str,
        close_history_group_before: bool,
    ) -> BreditorIntentResult {
        let generation = self.generation.clone();
        let checkpoint_format_version = self.inner.session_checkpoint_format_version();
        if let Err(error) = self.inner.check_observation(expected.inner()) {
            return BreditorIntentResult::from_error(
                generation,
                checkpoint_format_version,
                BreditorError::checkpointed_engine(&error),
            );
        }
        let Ok(intent_id) = IntentId::try_new(intent_id) else {
            return BreditorIntentResult::from_error(
                generation,
                checkpoint_format_version,
                BreditorError::new(INVALID_INTENT_ID_CODE, "the semantic intent ID is invalid"),
            );
        };
        if self
            .inner
            .compiled_profile_descriptor()
            .and_then(|descriptor| descriptor.intent(&intent_id))
            .is_some_and(|descriptor| descriptor.input_contract().is_some())
        {
            return BreditorIntentResult::from_error(
                generation,
                checkpoint_format_version,
                BreditorError::new(
                    INTENT_REQUIRES_INPUT_CODE,
                    "the semantic intent requires typed input",
                ),
            );
        }
        let invocation = IntentInvocation::without_input(intent_id);
        let outcome = if close_history_group_before {
            self.inner
                .execute_intent_after_closing_history_group(expected.inner(), &invocation)
                .map(|sequence| {
                    BreditorIntentResult::from_sequence(
                        generation.clone(),
                        checkpoint_format_version,
                        sequence,
                    )
                })
        } else {
            self.inner.execute_intent(expected.inner(), &invocation).map(|outcome| {
                BreditorIntentResult::from_outcome(
                    generation.clone(),
                    checkpoint_format_version,
                    outcome,
                )
            })
        };
        match outcome {
            Ok(result) => result,
            Err(error) => BreditorIntentResult::from_error(
                generation,
                checkpoint_format_version,
                BreditorError::checkpointed_engine(&error),
            ),
        }
    }
}
