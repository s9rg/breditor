//! Two actual native owners and exact document/review guards; no serialized proof input.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Version one requires native document and optional paired-review continuity together.
    #[allow(clippy::unused_self)]
    pub fn recovery_origin_version(&self) -> String {
        "1".into()
    }

    /// Check actual selected native origin without publishing, importing or granting access.
    pub fn verify_recovery_origin(
        &self,
        observed: &RichSharedObservation,
        origin: &RichReplicaProbe,
        origin_observed: &RichSharedObservation,
    ) -> Result<(), JsValue> {
        self.inner
            .verify_recovery_origin_guarded(&observed.inner, &origin.inner, &origin_observed.inner)
            .map_err(error)?;
        self.verify_review_origin(observed, origin, origin_observed)
    }
}

impl RichReplicaProbe {
    // Both explicitly selected document families must preserve the same independent review lane.
    pub(super) fn verify_review_origin(
        &self,
        observed: &RichSharedObservation,
        origin: &RichReplicaProbe,
        origin_observed: &RichSharedObservation,
    ) -> Result<(), JsValue> {
        match (&self.review, &origin.review) {
            (None, None) => Ok(()),
            (Some(current), Some(before)) => current
                .verify_recovery_origin_guarded(
                    observed
                        .review
                        .as_ref()
                        .ok_or_else(|| error("current native review guard absent"))?,
                    before,
                    origin_observed
                        .review
                        .as_ref()
                        .ok_or_else(|| error("origin native review guard absent"))?,
                )
                .map_err(error),
            _ => Err(error("native recovery origin review lane differs")),
        }
    }
}
