use breditor_core::{
    action::{
        ActionInputError, ActionPrepareError,
        builtins::{
            INSERT_PLAIN_TEXT_EMPTY_INPUT_CODE, INSERT_PLAIN_TEXT_INPUT_LIMIT_CODE,
            INSERT_PLAIN_TEXT_INPUT_NOT_STRING_CODE, INSERT_PLAIN_TEXT_PARAGRAPH_LIMIT_CODE,
            INSERT_TEXT_EMPTY_INPUT_CODE, INSERT_TEXT_INPUT_LIMIT_CODE,
            INSERT_TEXT_INPUT_NOT_STRING_CODE,
        },
    },
    codec::CodecErrorCode,
    engine::{CheckpointedEditorEngineError, EditorEngineError},
};
use wasm_bindgen::prelude::wasm_bindgen;

pub(crate) const INVALID_LINEAGE_CODE: &str = "breditor_wasm.invalid_lineage";
pub(crate) const INVALID_HISTORY_CAPACITY_CODE: &str = "breditor_wasm.invalid_history_capacity";
pub(crate) const INVALID_INITIAL_STATE_CODE: &str = "breditor_wasm.invalid_initial_state";
pub(crate) const BASE_ACTIONS_CODE: &str = "breditor_wasm.base_actions_unavailable";
pub(crate) const INVALID_ACTION_ID_CODE: &str = "breditor_wasm.invalid_action_id";
pub(crate) const UNKNOWN_ACTION_CODE: &str = "breditor_wasm.unknown_action";
pub(crate) const ACTION_REQUIRES_STRING_CODE: &str = "breditor_wasm.action_requires_string_input";
pub(crate) const ACTION_REJECTS_STRING_CODE: &str = "breditor_wasm.action_rejects_string_input";
pub(crate) const UNSUPPORTED_ACTION_INPUT_CODE: &str =
    "breditor_wasm.unsupported_action_input_shape";
pub(crate) const STRING_INPUT_LIMIT_CODE: &str = "breditor_wasm.string_input_limit";
pub(crate) const ACTION_VALUE_ENCODING_CODE: &str = "breditor_wasm.action_value_encoding";

/// Structured, stable, payload-redacting error returned by the Wasm boundary.
///
/// Only the machine-readable code and a fixed message cross the boundary. Rust
/// source errors, document text, action input, and codec diagnostics are never
/// forwarded through this type.
#[derive(Clone, Debug, Eq, PartialEq)]
#[wasm_bindgen]
pub struct BreditorError {
    code: &'static str,
    message: &'static str,
}

impl BreditorError {
    pub(crate) const fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }

    pub(crate) fn engine(error: &EditorEngineError) -> Self {
        if let Some(code) = exposed_action_input_code(error) {
            return Self::new(code, "the action input was rejected");
        }
        Self::new(error.code().as_str(), "the guarded editor command was rejected")
    }

    pub(crate) fn checkpointed_engine(error: &CheckpointedEditorEngineError) -> Self {
        if let Some(error) = error.editor_engine_error() {
            return Self::engine(error);
        }
        if let Some(code) = error.checkpoint_codec_code() {
            return Self::codec(code, "the candidate session checkpoint could not be represented");
        }
        Self::new(error.code().as_str(), "the checkpoint-constrained editor command was rejected")
    }

    pub(crate) const fn codec(code: CodecErrorCode, message: &'static str) -> Self {
        Self::new(code.as_str(), message)
    }
}

fn exposed_action_input_code(error: &EditorEngineError) -> Option<&'static str> {
    let EditorEngineError::ActionPreparation {
        source:
            ActionPrepareError::InvalidInput { source: ActionInputError::InvalidValue { code }, .. },
    } = error
    else {
        return None;
    };
    match code.as_str() {
        INSERT_TEXT_INPUT_NOT_STRING_CODE => Some(INSERT_TEXT_INPUT_NOT_STRING_CODE),
        INSERT_TEXT_EMPTY_INPUT_CODE => Some(INSERT_TEXT_EMPTY_INPUT_CODE),
        INSERT_TEXT_INPUT_LIMIT_CODE => Some(INSERT_TEXT_INPUT_LIMIT_CODE),
        INSERT_PLAIN_TEXT_INPUT_NOT_STRING_CODE => Some(INSERT_PLAIN_TEXT_INPUT_NOT_STRING_CODE),
        INSERT_PLAIN_TEXT_EMPTY_INPUT_CODE => Some(INSERT_PLAIN_TEXT_EMPTY_INPUT_CODE),
        INSERT_PLAIN_TEXT_INPUT_LIMIT_CODE => Some(INSERT_PLAIN_TEXT_INPUT_LIMIT_CODE),
        INSERT_PLAIN_TEXT_PARAGRAPH_LIMIT_CODE => Some(INSERT_PLAIN_TEXT_PARAGRAPH_LIMIT_CODE),
        _ => None,
    }
}

#[wasm_bindgen]
impl BreditorError {
    /// Returns the stable machine-readable failure code.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn code(&self) -> String {
        self.code.to_owned()
    }

    /// Returns a fixed payload-free human-readable summary.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn message(&self) -> String {
        self.message.to_owned()
    }
}
