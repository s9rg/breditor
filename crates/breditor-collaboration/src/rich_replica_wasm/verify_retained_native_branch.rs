//! Pure two-lane coverage, distinct from the original exact-entry origin proof.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Version one combines compatible document contributions with exact independent
    /// comment origin. It neither imports comments nor binds an unaffiliated lane.
    #[allow(clippy::unused_self)]
    pub fn retained_native_branch_version(&self) -> String {
        "1".into()
    }

    /// Prove document coverage AND the original paired comment continuation under
    /// actual native observations. No mutation, access grant, packet-store proof,
    /// provider acknowledgement or room activation follows from success.
    pub fn verify_retained_native_branch(
        &self,
        observed: &RichSharedObservation,
        source: &RichReplicaProbe,
        source_observed: &RichSharedObservation,
    ) -> Result<(), JsValue> {
        self.inner
            .verify_retained_branch_guarded(&observed.inner, &source.inner, &source_observed.inner)
            .map_err(error)?;
        self.verify_review_origin(observed, source, source_observed)
    }
}
