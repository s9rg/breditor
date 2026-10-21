//! Explicitly attach a segmented comment archive; the original attach/restore entry stays closed.
use super::{RichReplicaProbe, RichSharedObservation, error, policy};
use crate::Error;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Attach the exact new native comment family with separately supplied current host policy.
    pub fn enable_segmented_review(
        &mut self,
        observed: &RichSharedObservation,
        host_policy: &str,
        checkpoint: &str,
    ) -> Result<(), JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if self.review.is_some() {
            return Err(error(Error::Contract("review already enabled")));
        }
        let review = self
            .inner
            .restore_segmented_review_session(policy(host_policy)?, checkpoint)
            .map_err(error)?;
        self.review = Some(review);
        Ok(())
    }
}
