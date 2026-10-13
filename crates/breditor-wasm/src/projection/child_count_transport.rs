//! Unqualified private comparison of explicit JS values with optional-u32 ABI.
//! The public JS contract remains `number | undefined`; Rust retains `Option<u32>`.
//! No retries, normalization, fallback counts or weaker shape checks.
use super::BreditorProjection;
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

impl BreditorProjection {
    /// Returns the unchanged native count contract in this candidate build.
    #[must_use]
    pub fn child_count(&self, index: u32) -> Option<u32> {
        self.child_count_value(index)
    }
}

#[wasm_bindgen]
impl BreditorProjection {
    /// Experimental explicit-value transport of the exact computed count.
    #[must_use]
    #[wasm_bindgen(js_name = childCount, unchecked_return_type = "number | undefined")]
    pub fn child_count_js(&self, index: u32) -> JsValue {
        self.child_count(index).map_or(JsValue::UNDEFINED, JsValue::from)
    }
}
