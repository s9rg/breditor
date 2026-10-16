//! Thin explicitly negotiated native document-edge navigation boundary.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 declares native document start/end collapse; prior selection owners remain usable.
    #[allow(clippy::unused_self)]
    pub fn document_navigation_version(&self) -> String {
        "1".into()
    }
    /// Collapse explicit whole-document scope to `before` (start) or `after` (end).
    pub fn collapse_document_selection(
        &mut self,
        observation: &RichSharedObservation,
        side: &str,
    ) -> Result<bool, JsValue> {
        self.inner.collapse_document_selection_guarded(&observation.inner, side).map_err(error)
    }
}
