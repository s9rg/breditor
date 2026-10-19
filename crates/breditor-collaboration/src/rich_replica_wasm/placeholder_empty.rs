//! Guarded prompt eligibility, separate from immutable writing metadata V1.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Independent complete prompt-read capability, revision one.
    #[allow(clippy::unused_self)]
    pub fn placeholder_version(&self) -> String {
        "1".into()
    }
    /// Read accepted prompt eligibility without publishing or changing history.
    pub fn placeholder_empty(&self, observed: &RichSharedObservation) -> Result<bool, JsValue> {
        self.inner.placeholder_empty_guarded(&observed.inner).map_err(error)
    }
}
