//! Additive pure arbitrary-author prefix reads over the existing digest families.
use super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Complete pure-prefix capability, independent of both writer transport versions.
    #[allow(clippy::unused_self)]
    pub fn writer_prefix_read_version(&self) -> String {
        "1".into()
    }

    /// Exact applied original-transport prefix for any canonical author/counter.
    /// No author, import, publication, observation or Undo ownership is created.
    pub fn writer_clock_at(&self, writer: &str, through: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.writer_clock_at(writer, through).map_err(error)?)
            .map_err(error)
    }

    /// Explicit V2 atom-lineage prefix. Original digests are never reinterpreted.
    pub fn writer_clock_at_v2(&self, writer: &str, through: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.writer_clock_at_v2(writer, through).map_err(error)?)
            .map_err(error)
    }
}
