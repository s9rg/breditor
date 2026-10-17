//! Select the new local contract under an exact native observation, without authoring operations.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::{Error, rich_replica::ReviewedHistoryIdentity};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Caller pins identity from authenticated host metadata and selects matching durable storage.
    pub fn enable_reviewed_history(
        &mut self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<bool, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if input.len() > 1024 {
            return Err(error(Error::Limit("reviewed identity bytes")));
        }
        let identity: ReviewedHistoryIdentity = serde_json::from_str(input).map_err(error)?;
        self.inner.enable_reviewed_history_guarded(&observed.inner, identity).map_err(error)
    }
}
