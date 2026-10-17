//! Native source/owner validation precedes publishing one ordinary selective edit group.
use super::{
    super::{RichReplicaProbe, error},
    RichVersionRestorePlan,
};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Apply this owner's still-current opaque plan without restoring old comments or writer clocks.
    pub fn apply_document_version_restore(
        &mut self,
        plan: &RichVersionRestorePlan,
    ) -> Result<bool, JsValue> {
        self.inner.apply_document_version_restore(&plan.inner).map_err(error)
    }
}
