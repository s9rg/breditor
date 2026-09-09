use std::fmt;

use breditor_core::{
    action::{
        ActionInputError, ActionPrepareError,
        builtins::{
            INSERT_PLAIN_TEXT_EMPTY_INPUT_CODE, INSERT_PLAIN_TEXT_INPUT_LIMIT_CODE,
            INSERT_PLAIN_TEXT_INPUT_NOT_STRING_CODE, INSERT_PLAIN_TEXT_PARAGRAPH_LIMIT_CODE,
            INSERT_TEXT_EMPTY_INPUT_CODE, INSERT_TEXT_INPUT_LIMIT_CODE,
            INSERT_TEXT_INPUT_NOT_STRING_CODE,
        },
        routing::IntentRouteError,
    },
    codec::CodecErrorCode,
    engine::{CheckpointedEditorEngineError, EditorEngineError},
};
use wasm_bindgen::prelude::wasm_bindgen;

pub(crate) const INVALID_LINEAGE_CODE: &str = "breditor_wasm.invalid_lineage";
pub(crate) const INVALID_HISTORY_CAPACITY_CODE: &str = "breditor_wasm.invalid_history_capacity";
pub(crate) const INVALID_INITIAL_STATE_CODE: &str = "breditor_wasm.invalid_initial_state";
pub(crate) const INVALID_ACTION_ID_CODE: &str = "breditor_wasm.invalid_action_id";
pub(crate) const UNKNOWN_ACTION_CODE: &str = "breditor_wasm.unknown_action";
pub(crate) const ACTION_REQUIRES_STRING_CODE: &str = "breditor_wasm.action_requires_string_input";
pub(crate) const ACTION_REJECTS_STRING_CODE: &str = "breditor_wasm.action_rejects_string_input";
pub(crate) const ACTION_REJECTS_TYPED_CODE: &str = "breditor_wasm.action_rejects_typed_input";
pub(crate) const UNSUPPORTED_ACTION_INPUT_CODE: &str =
    "breditor_wasm.unsupported_action_input_shape";
pub(crate) const STRING_INPUT_LIMIT_CODE: &str = "breditor_wasm.string_input_limit";
pub(crate) const ACTION_VALUE_ENCODING_CODE: &str = "breditor_wasm.action_value_encoding";
pub(crate) const ACTION_VALUE_JSON_LIMIT_CODE: &str = "breditor_wasm.action_value_json_limit";
pub(crate) const INVALID_ACTION_VALUE_JSON_CODE: &str = "breditor_wasm.invalid_action_value_json";
pub(crate) const TYPED_INPUT_REJECTED_CODE: &str = "breditor_wasm.typed_input_rejected";
pub(crate) const INVALID_SELECTION_POINT_KIND_CODE: &str =
    "breditor_wasm.invalid_selection_point_kind";
pub(crate) const INVALID_SELECTION_COORDINATE_CODE: &str =
    "breditor_wasm.invalid_selection_coordinate";
pub(crate) const INVALID_SELECTION_AFFINITY_CODE: &str = "breditor_wasm.invalid_selection_affinity";
pub(crate) const INVALID_SELECTION_NODE_CODE: &str = "breditor_wasm.invalid_selection_node";
pub(crate) const SELECTION_READ_CODE: &str = "breditor_wasm.selection_read";
pub(crate) const ACTION_STATE_READ_CODE: &str = "breditor_wasm.action_state_read";
pub(crate) const PROFILE_BOOTSTRAP_LIMIT_CODE: &str = "breditor_wasm.profile_bootstrap_json_limit";
pub(crate) const INVALID_PROFILE_BOOTSTRAP_CODE: &str = "breditor_wasm.invalid_profile_bootstrap";
pub(crate) const PROFILE_COMPILATION_CODE: &str = "breditor_wasm.profile_compilation";
pub(crate) const INVALID_INTENT_ID_CODE: &str = "breditor_wasm.invalid_intent_id";
pub(crate) const INTENT_REQUIRES_INPUT_CODE: &str = "breditor_wasm.intent_requires_input";
pub(crate) const UNKNOWN_INTENT_CODE: &str = "breditor_wasm.unknown_intent";
pub(crate) const INTENT_REJECTS_TYPED_CODE: &str = "breditor_wasm.intent_rejects_typed_input";
pub(crate) const UNSUPPORTED_CHECKPOINT_FORMAT_CODE: &str =
    "breditor_wasm.unsupported_checkpoint_format";

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

impl fmt::Display for BreditorError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.message)
    }
}

impl std::error::Error for BreditorError {}

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

    pub(crate) fn typed_command(error: &CheckpointedEditorEngineError) -> Self {
        if error.editor_engine_error().is_some_and(editor_error_is_invalid_typed_input) {
            return Self::new(TYPED_INPUT_REJECTED_CODE, "the typed command input was rejected");
        }
        Self::checkpointed_engine(error)
    }

    pub(crate) const fn codec(code: CodecErrorCode, message: &'static str) -> Self {
        Self::new(code.as_str(), message)
    }

    pub(crate) const fn action_state_read() -> Self {
        Self::new(ACTION_STATE_READ_CODE, "the complete action state could not be represented")
    }
}

fn editor_error_is_invalid_typed_input(error: &EditorEngineError) -> bool {
    match error {
        EditorEngineError::ActionPreparation {
            source: ActionPrepareError::InvalidInput { .. },
        }
        | EditorEngineError::IntentRouting { source: IntentRouteError::InvalidInput { .. } } => {
            true
        }
        EditorEngineError::IntentRouting { source: IntentRouteError::Action { source, .. } } => {
            matches!(source.as_ref(), ActionPrepareError::InvalidInput { .. })
        }
        _ => false,
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
