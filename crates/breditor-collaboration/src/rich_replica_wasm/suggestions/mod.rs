//! Pure proposal capture/preview and retained native receipts. No browser-side Accept executor.
mod capture;
mod check_preview;
mod plan_general_text;
mod prepare;
mod read;
mod retained_receipt;
mod verify_source;
use super::error;
use crate::{Error, rich_replica::DocumentSuggestionPreparation};
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Independently disposable native preparation. Only the guarded editor can construct one.
#[wasm_bindgen(js_name = SharedSuggestionPreparation)]
pub struct RichSuggestionPreparation {
    inner: DocumentSuggestionPreparation,
}
#[wasm_bindgen(js_class = SharedSuggestionPreparation)]
impl RichSuggestionPreparation {
    /// Explicit Pending/Conflict/Ready metadata. Readiness never means accepted content or authority.
    pub fn summary_json(&self) -> String {
        match &self.inner {
            DocumentSuggestionPreparation::Pending { missing } => json!({"kind":"pending","missing":missing}),
            DocumentSuggestionPreparation::Conflict { targets } => json!({"kind":"conflict","targets":targets}),
            DocumentSuggestionPreparation::Ready(preview) => json!({"kind":"ready","suggestion":preview.info(),"changes":preview.changes(),"beforeAssets":preview.before_assets(),"afterAssets":preview.after_assets()}),
        }.to_string()
    }
    /// Frozen admitted proposed tree. Missing/conflicting sources are not replaced with accepted AST.
    pub fn document_json(&self) -> Result<String, JsValue> {
        match &self.inner {
            DocumentSuggestionPreparation::Ready(preview) => Ok(preview.document_json().into()),
            _ => Err(error(Error::Contract("suggestion preview is not ready"))),
        }
    }
}
