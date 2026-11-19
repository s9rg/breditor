//! Explicit layout capability and immutable native state; no DOM-derived target/value model.
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorStringResult;
use breditor_core::{codec::encode_rich_block_layout_state, rich_content::inspect_block_layout};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 selects layout (rich V3 or candidate V4); String0 means the old owner
    /// remains unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=blockLayoutVersion)]
    pub fn block_layout_version(&self) -> String {
        if self.inner.context().schema().supports_rich_block_layout() { "1" } else { "0" }.into()
    }
    /// String1 selects candidate V4 ordered-list numbering; String0 means unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=listNumberingVersion)]
    pub fn list_numbering_version(&self) -> String {
        if self.inner.context().schema().supports_rich_list_numbering() { "1" } else { "0" }.into()
    }
    /// String1 selects candidate V4 text-run language metadata; String0 means unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=textLanguageVersion)]
    pub fn text_language_version(&self) -> String {
        if self.inner.context().schema().supports_rich_text_language() { "1" } else { "0" }.into()
    }
}
#[wasm_bindgen]
impl BreditorRichObservation {
    /// Read independent fields from this frozen native selection, including inherited values.
    #[must_use]
    #[wasm_bindgen(js_name=blockLayoutStateJson)]
    pub fn block_layout_state_json(&self) -> BreditorStringResult {
        let state = self.inner.state();
        let read = inspect_block_layout(&self.context, state.document(), state.selection())
            .map_err(|_| error::rejected("breditor_rich.block_layout_state"))
            .and_then(|v| {
                encode_rich_block_layout_state(&self.context, &v)
                    .map_err(|_| error::rejected("breditor_rich.block_layout_state"))
            });
        match read {
            Ok(value) => BreditorStringResult::from_value(value),
            Err(error) => BreditorStringResult::from_error(error),
        }
    }
}
