use breditor_core::codec::{EditorStateJsonCodec, EditorStateJsonCodecV2, EditorStateJsonCodecV3};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError, BreditorStringResult};

#[wasm_bindgen]
impl BreditorEngine {
    /// Encodes the current immutable editor state in its selected checkpoint generation.
    ///
    /// This does not include undo/redo history. Encoding is a separate fallible
    /// read, returns a structured result for a live handle, and never changes
    /// the engine.
    #[must_use]
    #[wasm_bindgen(js_name = stateJson)]
    pub fn state_json(&self) -> BreditorStringResult {
        let state = self.inner.state();
        match self.inner.session_checkpoint_format_version() {
            1 => match EditorStateJsonCodec::new(state.context().clone()).encode(state) {
                Ok(json) => BreditorStringResult::from_value(json),
                Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                    error.code(),
                    "the current editor state could not be encoded",
                )),
            },
            2 => match EditorStateJsonCodecV2::new(state.context().clone()).encode(state) {
                Ok(json) => BreditorStringResult::from_value(json),
                Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                    error.code(),
                    "the current editor state could not be encoded",
                )),
            },
            3 => match EditorStateJsonCodecV3::new(state.context().clone()).encode(state) {
                Ok(json) => BreditorStringResult::from_value(json),
                Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                    error.code(),
                    "the current editor state could not be encoded",
                )),
            },
            _ => BreditorStringResult::from_error(BreditorError::new(
                crate::error::UNSUPPORTED_CHECKPOINT_FORMAT_CODE,
                "the engine checkpoint format is unsupported",
            )),
        }
    }
}
