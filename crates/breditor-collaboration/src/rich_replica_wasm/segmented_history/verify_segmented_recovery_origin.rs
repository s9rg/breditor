//! Verify-segmented-recovery-origin/v1: exact document and independently guarded review continuity.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Verify both actual native owners, retaining exact original/segmented document inputs and
    /// paired comment history. This pure check grants no current host or storage authority.
    pub fn verify_segmented_recovery_origin(
        &self,
        observed: &RichSharedObservation,
        origin: &RichReplicaProbe,
        origin_observed: &RichSharedObservation,
    ) -> Result<(), JsValue> {
        self.inner
            .verify_segmented_recovery_origin_guarded(
                &observed.inner,
                &origin.inner,
                &origin_observed.inner,
            )
            .map_err(error)?;
        self.verify_review_origin(observed, origin, origin_observed)
    }
}
