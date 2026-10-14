//! Immutable rich owner observation with exact process-local publication identity.

use super::{error, view};
use crate::BreditorStringResult;
use breditor_core::{
    codec::DocumentJsonCodecV2, rich_content::RichLocalSnapshot, state::EditorContext,
};
use wasm_bindgen::prelude::wasm_bindgen;

/// Opaque rich publication observation; serialized revisions are not mutation authority.
#[wasm_bindgen]
pub struct BreditorRichObservation {
    pub(super) inner: RichLocalSnapshot,
    pub(super) context: EditorContext,
    pub(super) undo_depth: u32,
    pub(super) redo_depth: u32,
    pub(super) capacity: u32,
}
#[wasm_bindgen]
impl BreditorRichObservation {
    /// Read a semantic structured/plain transfer for this selection; collapsed/cleared selection is absent.
    #[must_use]
    #[wasm_bindgen(js_name=clipboardJson)]
    pub fn clipboard_json(&self) -> BreditorStringResult {
        match super::clipboard::encode(self) {
            Ok(Some(value)) => BreditorStringResult::from_value(value),
            Ok(None) => BreditorStringResult::absent(),
            Err(error) => BreditorStringResult::from_error(error),
        }
    }
    /// Exact publication revision as canonical decimal, never a floating-point bridge value.
    #[must_use]
    #[wasm_bindgen(getter)]
    pub fn revision(&self) -> String {
        self.inner.state().revision().get().to_string()
    }
    /// Read Document V2 separately from mutation publication.
    #[must_use]
    #[wasm_bindgen(js_name=documentJson)]
    pub fn document_json(&self) -> BreditorStringResult {
        match DocumentJsonCodecV2::new(self.context.schema().clone())
            .with_limits(self.context.limits().clone())
            .encode(self.inner.state().document().document())
        {
            Ok(value) => BreditorStringResult::from_value(value),
            Err(_) => {
                BreditorStringResult::from_error(error::rejected("breditor_rich.document_read"))
            }
        }
    }
    /// Read the bounded rich render/selection view as JSON text, not individual numeric getters.
    #[must_use]
    #[wasm_bindgen(js_name=viewJson)]
    pub fn view_json(&self) -> BreditorStringResult {
        match view::encode(self) {
            Ok(value) => BreditorStringResult::from_value(value),
            Err(error) => BreditorStringResult::from_error(error),
        }
    }
}
