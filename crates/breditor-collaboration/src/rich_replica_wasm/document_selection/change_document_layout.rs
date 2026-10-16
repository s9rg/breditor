//! Thin guarded V3 document layout boundary; native field ownership and exact replay stay authoritative.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Apply document-family layout in one explicit native semantic group.
    pub fn change_document_selection_layout(
        &mut self,
        observation: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner
            .change_document_selection_layout_json_guarded(&observation.inner, input)
            .map_err(error)
    }
}
