//! Discoverable code-exit capability; the guarded command still uses existing local history.
use super::BreditorRichEditor;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl BreditorRichEditor {
    /// Version of the explicit `exitCodeBlock` native command, independent of the saved protocol.
    #[must_use]
    #[wasm_bindgen(js_name=codeExitVersion)]
    pub fn code_exit_version(&self) -> String {
        "1".to_owned()
    }
}
