//! Return an opaque current-source preparation, never a mutable JSON edit plan or Accept action.
use super::{
    super::{RichReplicaProbe, RichSharedObservation, error},
    RichSuggestionPreparation,
};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Pure Pending/Conflict/Ready preview under the exact observed publication, including read-only.
    pub fn prepare_document_suggestion(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<RichSuggestionPreparation, JsValue> {
        Ok(RichSuggestionPreparation {
            inner: self
                .inner
                .prepare_document_suggestion_guarded(&observed.inner, input)
                .map_err(error)?,
        })
    }
}
