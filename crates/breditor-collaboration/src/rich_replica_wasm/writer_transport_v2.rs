//! Explicit packing-independent transport reads; original writer APIs retain version-one digests.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String2 declares explicit atom-level group and prefix digests, not a document-model upgrade.
    #[allow(clippy::unused_self)]
    pub fn writer_transport_v2_version(&self) -> String {
        "2".to_owned()
    }
    /// Export bounded complete authored groups under the exact observation using transport V2.
    pub fn writer_groups_v2(
        &self,
        observation: &RichSharedObservation,
        after: &str,
    ) -> Result<String, JsValue> {
        self.inner.writer_groups_v2_guarded(&observation.inner, after).map_err(error)
    }
    /// Read an applied author's packing-independent transport V2 prefix; never an authorization token.
    pub fn writer_clock_v2(&self, writer: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.writer_clock_v2(writer).map_err(error)?).map_err(error)
    }
}
