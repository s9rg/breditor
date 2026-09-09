use breditor_core::action::{ActionId, ActionInput, ActionInvocation};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
    BreditorCommandResult, BreditorEngine, BreditorError, BreditorObservation,
    command::{action_value_json_error, decode_action_value_json},
    error::{ACTION_REJECTS_TYPED_CODE, INVALID_ACTION_ID_CODE, UNKNOWN_ACTION_CODE},
};

#[wasm_bindgen]
impl BreditorEngine {
    /// Executes one registered typed-input action from strict bounded JSON.
    ///
    /// JavaScript supplies only the action identity and value. The exact input
    /// contract name and version come from the immutable registered descriptor,
    /// so callers cannot forge or downgrade the envelope. Stale observation
    /// rejection precedes identity and JSON admission; the authoritative core
    /// repeats the complete guard immediately before mutation. When
    /// `close_history_group_before` is true, the history close and action are
    /// admitted and published as one checkpointed candidate.
    #[wasm_bindgen(js_name = executeTypedActionJson)]
    pub fn execute_typed_action_json(
        &mut self,
        expected: &BreditorObservation,
        action_id: &str,
        input_json: &str,
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
                Some(contract) => contract.clone(),
                None => {
                    return BreditorCommandResult::from_error(
                        self,
                        BreditorError::new(
                            ACTION_REJECTS_TYPED_CODE,
                            "the action does not accept typed input",
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
        let value = match decode_action_value_json(input_json) {
            Ok(value) => value,
            Err(error) => {
                return BreditorCommandResult::from_error(self, action_value_json_error(error));
            }
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
                BreditorCommandResult::from_error(self, BreditorError::typed_command(&error))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{error::Error, io};

    use breditor_core::{
        position::{Affinity, NodePath, Point},
        selection::{RangeSelection, Selection},
    };

    use super::*;

    type TestResult<T = ()> = Result<T, Box<dyn Error>>;

    const TEXT_DOCUMENT_JSON: &str = r#"{
      "format":"breditor/document","formatVersion":1,
      "schema":{"name":"breditor/base","version":1},
      "root":{"kind":"element","type":"breditor/document","entityId":null,"properties":{},
        "children":[{"kind":"element","type":"breditor/paragraph","entityId":null,
          "properties":{},"children":[{"kind":"text","text":"a","formats":[]}]}]}
    }"#;

    #[test]
    fn action_contract_is_derived_and_json_is_validated_before_dispatch() -> TestResult {
        let mut engine = engine()?;
        let initial = engine.observation();
        let checkpoint = checkpoint_json(&engine)?;

        let atomic_invalid = engine.execute_typed_action_json(
            &initial,
            "breditor/insert-text",
            r#"{"operation":"set","operation":"remove"}"#,
            true,
        );
        assert_error(&atomic_invalid, crate::error::INVALID_ACTION_VALUE_JSON_CODE, "operation")?;
        let rejected_value =
            engine.execute_typed_action_json(&initial, "breditor/insert-text", "null", true);
        assert_error(&rejected_value, crate::error::TYPED_INPUT_REJECTED_CODE, "private")?;
        assert_eq!(checkpoint_json(&engine)?, checkpoint);

        let invalid_value = engine.execute_typed_action_json(
            &initial,
            "breditor/insert-text",
            r#"{"operation":"set","operation":"remove"}"#,
            false,
        );
        assert_error(&invalid_value, crate::error::INVALID_ACTION_VALUE_JSON_CODE, "operation")?;

        let no_contract = engine.execute_typed_action_json(
            &initial,
            "breditor/toggle-strong",
            "private malformed JSON",
            false,
        );
        assert_error(&no_contract, ACTION_REJECTS_TYPED_CODE, "private")?;

        let unknown = engine.execute_typed_action_json(
            &initial,
            "example/missing-action",
            "private malformed JSON",
            false,
        );
        assert_error(&unknown, UNKNOWN_ACTION_CODE, "private")?;

        advance_selection(&mut engine, &initial)?;
        let selected = engine.observation();
        let valid =
            engine.execute_typed_action_json(&selected, "breditor/insert-text", r#""x""#, true);
        assert_eq!(valid.status(), "committed");
        assert!(!valid.history_group_closed_before());
        assert!(valid.error().is_none());
        Ok(())
    }

    #[test]
    fn stale_observation_precedes_identity_and_json_admission() -> TestResult {
        let mut engine = engine()?;
        let stale = engine.observation();
        advance_selection(&mut engine, &stale)?;
        let checkpoint = checkpoint_json(&engine)?;

        let result = engine.execute_typed_action_json(
            &stale,
            "not an action identity",
            "private malformed JSON",
            true,
        );
        assert_error(&result, "editor_engine.stale_snapshot", "private")?;
        assert_eq!(checkpoint_json(&engine)?, checkpoint);
        Ok(())
    }

    #[test]
    fn transport_limit_is_redacted_and_atomic() -> TestResult {
        let mut engine = engine()?;
        let observation = engine.observation();
        let before = checkpoint_json(&engine)?;
        let private = "private".repeat(
            super::super::action_value_json_decode::MAX_ACTION_VALUE_JSON_BYTES / "private".len()
                + 1,
        );
        let result =
            engine.execute_typed_action_json(&observation, "breditor/insert-text", &private, true);
        assert_error(&result, crate::error::ACTION_VALUE_JSON_LIMIT_CODE, "private")?;
        assert_eq!(checkpoint_json(&engine)?, before);
        Ok(())
    }

    fn engine() -> TestResult<BreditorEngine> {
        let mut result =
            BreditorEngine::from_document_json("typed-action-json", TEXT_DOCUMENT_JSON, 100.0);
        result
            .take_engine()
            .ok_or_else(|| io::Error::other("typed action fixture engine was absent").into())
    }

    fn advance_selection(
        engine: &mut BreditorEngine,
        expected: &BreditorObservation,
    ) -> TestResult {
        let point = Point::Text {
            text_path: NodePath::try_from_indices(vec![0, 0])?,
            utf16_offset: 1,
            affinity: Affinity::After,
        };
        let selection: Selection = RangeSelection::new(point.clone(), point).into();
        let event = engine.inner.set_selection(expected.inner(), Some(selection))?;
        if event.is_none() {
            return Err(io::Error::other("selection did not advance the engine").into());
        }
        Ok(())
    }

    fn checkpoint_json(engine: &BreditorEngine) -> TestResult<String> {
        engine
            .session_checkpoint_json()
            .take_value()
            .ok_or_else(|| io::Error::other("checkpoint JSON was absent").into())
    }

    fn assert_error(result: &BreditorCommandResult, code: &str, private: &str) -> TestResult {
        assert_eq!(result.status(), "error");
        assert!(result.observation().is_none());
        let error = result.error().ok_or_else(|| io::Error::other("command error was absent"))?;
        assert_eq!(error.code(), code);
        assert!(!error.message().contains(private));
        Ok(())
    }
}
