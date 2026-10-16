//! Explicit document presence read/export pair; old native packet methods remain closed to scope.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Version string1 pairs the separate ephemeral capture and pure resolver.
    #[allow(clippy::unused_self)]
    pub fn document_presence_version(&self) -> String {
        "1".into()
    }
    /// Capture exact document-family scope under this owner's opaque observation.
    pub fn document_presence_frame(
        &self,
        observation: &RichSharedObservation,
    ) -> Result<String, JsValue> {
        self.inner.document_presence_frame_guarded(&observation.inner).map_err(error)
    }
    /// Pure document-family causal resolution; never imports updates or changes UI/history.
    pub fn resolve_document_presence(&self, frame: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.resolve_document_presence_frame(frame).map_err(error)?)
            .map_err(error)
    }
}
