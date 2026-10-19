//! Explicit guarded immutable packet reads, separate from original version/proposal families.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String revision one requires all three guarded packet dependency reads.
    #[allow(clippy::unused_self)]
    pub fn packet_asset_references_version(&self) -> String {
        "1".into()
    }
    /// Read admitted snapshot bindings without importing operations or inferring source authenticity.
    pub fn document_version_asset_references_json(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        self.inner
            .document_version_asset_references_json_guarded(&observed.inner, input)
            .map_err(error)
    }
    /// Read a native evaluated proposal or explicit missing-source result, never an accepted edit.
    pub fn document_suggestion_asset_references_json(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        self.inner
            .document_suggestion_asset_references_json_guarded(&observed.inner, input)
            .map_err(error)
    }
    /// Read both revision intents under their unchanged native source/lineage laws.
    pub fn document_suggestion_revision_asset_references_json(
        &self,
        observed: &RichSharedObservation,
        previous: &str,
        input: &str,
    ) -> Result<String, JsValue> {
        self.inner
            .document_suggestion_revision_asset_references_json_guarded(
                &observed.inner,
                previous,
                input,
            )
            .map_err(error)
    }
}
