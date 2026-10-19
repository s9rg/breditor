//! Explicit guarded retained-image metadata; no persisted or mutation protocol change.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String revision one requires the complete guarded retained-image read.
    #[allow(clippy::unused_self)]
    pub fn retained_asset_references_version(&self) -> String {
        "1".into()
    }
    /// Read conservative retained history without changing causal state, UI or future history.
    pub fn retained_asset_references_json(
        &self,
        observed: &RichSharedObservation,
    ) -> Result<String, JsValue> {
        self.inner.retained_asset_references_json_guarded(&observed.inner).map_err(error)
    }
}
