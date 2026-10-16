//! Explicit atom-edit capability; saved schemas/history formats keep their original meaning.
use super::BreditorRichEditor;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 supports native whole-atom deletion, plain replacement and first-key replacement.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name = atomEditVersion)]
    pub fn atom_edit_version(&self) -> String {
        "1".to_owned()
    }
}
