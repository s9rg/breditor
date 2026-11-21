//! V4 mention, table-caption and page-break capabilities; insertion is the
//! `insertMention` command, captions use `addTableCaption` / `removeTableCaption` and page
//! breaks use `insertPageBreak` / `deletePageBreak` (or a `pageBreak` flow draft).
use super::BreditorRichEditor;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 selects V4 mention entities (`insertMention`); String0 means unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=mentionVersion)]
    pub fn mention_version(&self) -> String {
        if self.inner.context().schema().supports_rich_mentions() { "1" } else { "0" }.into()
    }
    /// String1 selects V4 table captions (`addTableCaption`, `removeTableCaption`);
    /// String0 means unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=tableCaptionVersion)]
    pub fn table_caption_version(&self) -> String {
        if self.inner.context().schema().supports_rich_table_captions() { "1" } else { "0" }.into()
    }
    /// String1 selects V4 root-level page breaks (`insertPageBreak`,
    /// `deletePageBreak`, the `pageBreak` flow draft); String0 means unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=pageBreakVersion)]
    pub fn page_break_version(&self) -> String {
        if self.inner.context().schema().supports_rich_page_breaks() { "1" } else { "0" }.into()
    }
}
