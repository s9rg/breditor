//! Explicit extended view read; the original rich-view family remains text/node/grid only.
use super::{BreditorRichObservation, view};
use crate::BreditorStringResult;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichObservation {
    /// Read document/text/node/grid UI in the separate breditor/rich-document-view V1 family.
    /// Original viewJson rejects a Document scope rather than emitting an unknown selection tag.
    #[must_use]
    #[wasm_bindgen(js_name=documentViewJson)]
    pub fn document_view_json(&self) -> BreditorStringResult {
        view::encode_document(self)
            .map_or_else(BreditorStringResult::from_error, BreditorStringResult::from_value)
    }
}
