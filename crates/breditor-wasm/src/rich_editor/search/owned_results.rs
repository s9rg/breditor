//! Independently disposable, frozen result. Only the live matching actor may publish from it.
use crate::{BreditorStringResult, rich_editor::error};
use breditor_core::{codec::decode_rich_search_navigation, rich_content::RichSearchResults};
use std::sync::Arc;
use wasm_bindgen::prelude::wasm_bindgen;

/// Opaque native complete matches; metadata alone is not edit or navigation authority.
#[wasm_bindgen]
pub struct BreditorRichSearchResults {
    pub(super) owner: Arc<()>,
    pub(super) inner: RichSearchResults,
    pub(super) metadata: String,
}
#[wasm_bindgen]
impl BreditorRichSearchResults {
    /// Frozen complete bounded match metadata, with decimal-string coordinates and no text copies.
    #[must_use]
    #[wasm_bindgen(js_name=metadataJson)]
    pub fn metadata_json(&self) -> String {
        self.metadata.clone()
    }
    /// Pure logical navigation over retained native matches. Absence means no match in that direction.
    #[must_use]
    pub fn navigate(&self, input: &str) -> BreditorStringResult {
        match decode_rich_search_navigation(&self.inner, input) {
            Ok(Some(index)) => BreditorStringResult::from_value(index),
            Ok(None) => BreditorStringResult::absent(),
            Err(_) => {
                BreditorStringResult::from_error(error::rejected("breditor_rich.search_navigation"))
            }
        }
    }
}
