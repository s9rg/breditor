//! Exact optional native flow capability, separate from every saved format and schema.
use super::BreditorRichEditor;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 supports logical flow movement and explicit paragraph creation beside atoms.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name = flowNavigationVersion)]
    pub fn flow_navigation_version(&self) -> String {
        "1".to_owned()
    }
}
