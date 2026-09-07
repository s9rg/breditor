use breditor_core::codec::{EditorStateJsonCodec, EditorStateJsonCodecV2};
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError, BreditorStringResult};

#[wasm_bindgen]
impl BreditorEngine {
    /// Encodes the current immutable editor state as mode-selected V1 or V2 JSON.
    ///
    /// This does not include undo/redo history. Encoding is a separate fallible
    /// read, returns a structured result for a live handle, and never changes
    /// the engine.
    #[must_use]
    #[wasm_bindgen(js_name = stateJson)]
    pub fn state_json(&self) -> BreditorStringResult {
        if self.inner.session_checkpoint_format_version() == 1 {
            match EditorStateJsonCodec::new(self.inner.state().context().clone())
                .encode(self.inner.state())
            {
                Ok(json) => BreditorStringResult::from_value(json),
                Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                    error.code(),
                    "the current editor state could not be encoded",
                )),
            }
        } else {
            match EditorStateJsonCodecV2::new(self.inner.state().context().clone())
                .encode(self.inner.state())
            {
                Ok(json) => BreditorStringResult::from_value(json),
                Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                    error.code(),
                    "the current editor state could not be encoded",
                )),
            }
        }
    }
}
