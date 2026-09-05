use breditor_core::codec::SessionCheckpointJsonCodec;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorError, BreditorStringResult};

#[wasm_bindgen]
impl BreditorEngine {
    /// Encodes current state and retained linear history as Session Checkpoint
    /// V1 JSON.
    ///
    /// Encoding is a separate fallible read, returns a structured result for a
    /// live handle, and never changes the engine.
    #[must_use]
    #[wasm_bindgen(js_name = sessionCheckpointJson)]
    pub fn session_checkpoint_json(&self) -> BreditorStringResult {
        match SessionCheckpointJsonCodec::new(self.inner.state().context().clone())
            .encode(self.inner.session())
        {
            Ok(json) => BreditorStringResult::from_value(json),
            Err(error) => BreditorStringResult::from_error(BreditorError::codec(
                error.code(),
                "the current session checkpoint could not be encoded",
            )),
        }
    }
}
