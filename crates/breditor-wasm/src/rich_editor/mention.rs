//! Candidate V4 mention capability; insertion is the `insertMention` command.
use super::BreditorRichEditor;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 selects candidate V4 mention entities (`insertMention`); String0 means unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=mentionVersion)]
    pub fn mention_version(&self) -> String {
        if self.inner.context().schema().supports_rich_mentions() { "1" } else { "0" }.into()
    }
}
