use wasm_bindgen::prelude::wasm_bindgen;

use crate::{BreditorEngine, BreditorStringResult};

#[wasm_bindgen]
impl BreditorEngine {
    /// Encodes current state and retained linear history as Session Checkpoint
    /// V1 JSON.
    ///
    /// The checkpoint was encoded before its session became authoritative, so
    /// a live engine always returns a successful clone of the cached canonical
    /// bytes. Allocation failure remains a WebAssembly trap rather than a
    /// structured domain error.
    #[must_use]
    #[wasm_bindgen(js_name = sessionCheckpointJson)]
    pub fn session_checkpoint_json(&self) -> BreditorStringResult {
        BreditorStringResult::from_value(self.inner.session_checkpoint_json().to_owned())
    }
}
