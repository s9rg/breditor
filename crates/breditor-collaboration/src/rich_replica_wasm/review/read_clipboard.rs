//! Additive semantic clipboard read for historical native anchors.
use super::{RichReplicaProbe, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Exact capability for historical rich clipboard reads.
    #[must_use]
    #[allow(clippy::unused_self)]
    pub fn review_clipboard_version(&self) -> String {
        "1".into()
    }

    /// Return the original selection as a bounded native clipboard result.
    pub fn read_review_clipboard(&self, input: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.read_review_clipboard(input).map_err(error)?)
            .map_err(error)
    }
}
