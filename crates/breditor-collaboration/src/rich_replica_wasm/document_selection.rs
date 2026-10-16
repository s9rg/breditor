//! Explicit scope/view/recovery capabilities, independent from original selection DTOs.
mod enable_document_selection;
mod replace_document_plain_text;
mod replace_document_typing_text;
mod select_document;
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 declares whole-document scope with separate closed view and recovery families.
    #[allow(clippy::unused_self)]
    pub fn document_selection_version(&self) -> String {
        "1".into()
    }
    /// String1 declares first-key document replacement followed by native grouped typing.
    #[allow(clippy::unused_self)]
    pub fn document_typing_version(&self) -> String {
        "1".into()
    }
    /// Whether this owner explicitly selected document-selection recovery.
    pub fn document_selection_enabled(&self) -> bool {
        self.inner.document_selection_enabled()
    }
    /// Capture an exact opaque guard with a frozen explicit document-view family.
    pub fn observe_document(&self) -> Result<RichSharedObservation, JsValue> {
        self.inner.observe_document().map(|inner| RichSharedObservation { inner }).map_err(error)
    }
    /// Read only the explicitly enabled document view; old view getters remain closed.
    pub fn document_view_json(&self) -> Result<String, JsValue> {
        self.inner.document_view_json().map_err(error)
    }
    /// Pure guarded semantic Copy, including all atoms and hidden table content.
    pub fn copy_document_clipboard(
        &self,
        observation: &RichSharedObservation,
    ) -> Result<String, JsValue> {
        serde_json::to_string(
            &self.inner.copy_document_clipboard_guarded(&observation.inner).map_err(error)?,
        )
        .map_err(error)
    }
    /// Save only explicit document-scope ordinary selective history.
    pub fn document_checkpoint(&self) -> Result<String, JsValue> {
        self.inner.document_checkpoint().map_err(error)
    }
    /// Save only explicit document-scope natural selective history, retaining its exact partition.
    pub fn document_typing_checkpoint(&self) -> Result<String, JsValue> {
        self.inner.document_typing_checkpoint().map_err(error)
    }
}
