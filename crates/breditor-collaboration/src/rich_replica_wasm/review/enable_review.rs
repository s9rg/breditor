//! Attach exactly one comment owner without inferring review from old document checkpoints.
use super::{RichReplicaProbe, RichSharedObservation, error, policy};
use crate::Error;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Discover the complete optional native comment/anchor contract.
    #[allow(clippy::unused_self)]
    pub fn review_version(&self) -> String {
        "1".into()
    }
    /// Whether this raw owner already carries a separate metadata lane; facades must adopt explicitly.
    pub fn review_enabled(&self) -> bool {
        self.review.is_some()
    }
    /// Attach an empty or explicitly restored sidecar under separate live host authority.
    /// Existing review ownership cannot be silently replaced. Saved data supplies no role grant.
    pub fn enable_review(
        &mut self,
        observed: &RichSharedObservation,
        host_policy: &str,
        checkpoint: Option<String>,
    ) -> Result<(), JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if self.review.is_some() {
            return Err(error(Error::Contract("review already enabled")));
        }
        let policy = policy(host_policy)?;
        let review = if let Some(saved) = checkpoint {
            self.inner.restore_review_session(policy, &saved)
        } else {
            self.inner.create_review_session(policy)
        }
        .map_err(error)?;
        self.review = Some(review);
        Ok(())
    }
}
