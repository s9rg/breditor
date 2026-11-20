//! Candidate V4 mention and table-caption capabilities; insertion is the `insertMention`
//! command and captions use `addTableCaption` / `removeTableCaption`.
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
    /// String1 selects candidate V4 table captions (`addTableCaption`, `removeTableCaption`);
    /// String0 means unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=tableCaptionVersion)]
    pub fn table_caption_version(&self) -> String {
        if self.inner.context().schema().supports_rich_table_captions() { "1" } else { "0" }.into()
    }
}
