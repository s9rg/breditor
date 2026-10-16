//! Additive guarded code-exit boundary; no new causal model, command or journal encoding.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Exact native capability, not permission or a saved protocol revision.
    #[allow(clippy::unused_self)]
    pub fn code_exit_version(&self) -> String {
        "1".to_owned()
    }
    /// Insert one plain paragraph after the guarded current code caret.
    pub fn exit_code_block(
        &mut self,
        observation: &RichSharedObservation,
        paragraph: &str,
    ) -> Result<bool, JsValue> {
        self.inner.exit_code_block_guarded(&observation.inner, paragraph).map_err(error)
    }
}
