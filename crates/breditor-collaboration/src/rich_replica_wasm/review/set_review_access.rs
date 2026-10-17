//! Change only the authenticated host's live comment policy, not identity or saved authority.
use super::{RichReplicaProbe, RichSharedObservation, access, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Apply a host policy update under both exact observations; old views cannot retain revoked rights.
    pub fn set_review_access(
        &mut self,
        observed: &RichSharedObservation,
        value: &str,
    ) -> Result<bool, JsValue> {
        let token = self.check_review(observed)?.clone();
        let review = self.review.as_mut().ok_or_else(|| error("review unavailable"))?;
        review.set_access(&token, access(value)?).map_err(error)?;
        Ok(review.check(&token).is_err())
    }
}
