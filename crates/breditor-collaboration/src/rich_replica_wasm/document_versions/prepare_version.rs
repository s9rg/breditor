//! Return a native opaque restore proof instead of trusting a mutable preview JSON supplied by the host.
use super::{
    super::{RichReplicaProbe, RichSharedObservation, error},
    RichVersionRestorePlan,
};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Prepare semantic restore with a permanently consumed host namespace and exact source guard.
    pub fn prepare_document_version_restore(
        &self,
        observed: &RichSharedObservation,
        input: &str,
        prefix: &str,
    ) -> Result<RichVersionRestorePlan, JsValue> {
        Ok(RichVersionRestorePlan {
            inner: self
                .inner
                .prepare_document_version_restore_guarded(&observed.inner, input, prefix)
                .map_err(error)?,
        })
    }
}
