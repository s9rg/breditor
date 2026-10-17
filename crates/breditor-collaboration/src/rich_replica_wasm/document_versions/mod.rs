//! Opaque prepared native version restores, never JSON plans that can be edited before apply.
mod apply_version;
mod capture_version;
mod compare_version;
mod prepare_version;
mod read_version;
use super::error;
use crate::rich_replica::DocumentVersionRestorePlan;
use wasm_bindgen::prelude::*;
/// Independently disposable exact native restore preview; only the native owner can prepare one.
#[wasm_bindgen(js_name = SharedVersionRestorePlan)]
pub struct RichVersionRestorePlan {
    inner: DocumentVersionRestorePlan,
}
#[wasm_bindgen(js_class = SharedVersionRestorePlan)]
impl RichVersionRestorePlan {
    /// Frozen admitted semantic result with fresh IDs; no browser document edits are performed.
    pub fn document_json(&self) -> String {
        self.inner.document_json().into()
    }
    /// Read descriptive version attribution without granting any permissions.
    pub fn version_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(self.inner.version()).map_err(error)
    }
    /// Read native semantic differences underlying this source-guarded restore preview.
    pub fn comparison_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(self.inner.comparison()).map_err(error)
    }
}
