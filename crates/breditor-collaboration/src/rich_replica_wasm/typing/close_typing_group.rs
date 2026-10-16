//! History-only intent fence; never a content edit or implicit focus change.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Close active continuation without discarding Redo; inactive mode is a true no-op.
    pub fn close_typing_group(
        &mut self,
        observation: &RichSharedObservation,
    ) -> Result<bool, JsValue> {
        self.inner.close_typing_group_guarded(&observation.inner).map_err(error)
    }
}
