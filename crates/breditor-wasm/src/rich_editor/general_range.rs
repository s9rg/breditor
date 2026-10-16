//! Separate native general-input commands; original range commands keep their meanings.
use super::BreditorRichEditor;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 supports explicit rich/plain/typing targets and native floor allocation.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=generalRangeVersion)]
    pub fn general_range_version(&self) -> String {
        "1".to_owned()
    }
}
