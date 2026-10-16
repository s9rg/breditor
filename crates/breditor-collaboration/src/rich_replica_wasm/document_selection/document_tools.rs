//! Separate document-tool methods; original selection/format/layout getters remain closed to scope.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 pairs explicit document-family read proofs and whole-document semantic actions.
    #[allow(clippy::unused_self)]
    pub fn document_tools_version(&self) -> String {
        "1".into()
    }
    /// Pure native coverage with unchanged read payload semantics and no mutation authority.
    pub fn document_selection_coverage_json(
        &self,
        observation: &RichSharedObservation,
        scope: &str,
    ) -> Result<String, JsValue> {
        self.inner
            .document_selection_coverage_json_guarded(&observation.inner, scope)
            .map_err(error)
    }
    /// Pure native selection-format state from explicit document-family scope/proof.
    pub fn document_selection_format_state_json(
        &self,
        observation: &RichSharedObservation,
        kind: &str,
    ) -> Result<String, JsValue> {
        self.inner
            .document_selection_format_state_json_guarded(&observation.inner, kind)
            .map_err(error)
    }
    /// Pure V3 layout state from explicit document-family scope/proof.
    pub fn document_block_layout_state_json(
        &self,
        observation: &RichSharedObservation,
    ) -> Result<String, JsValue> {
        self.inner.document_block_layout_state_json_guarded(&observation.inner).map_err(error)
    }
}
