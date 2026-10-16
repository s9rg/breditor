//! Explicit layout capability and immutable native state; no DOM-derived target/value model.
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorStringResult;
use breditor_core::{codec::encode_rich_block_layout_state, rich_content::inspect_block_layout};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 selects layout V3; String0 means the old owner remains unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=blockLayoutVersion)]
    pub fn block_layout_version(&self) -> String {
        if self.inner.context().schema().rich_content_revision() == Some(3) { "1" } else { "0" }
            .into()
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
