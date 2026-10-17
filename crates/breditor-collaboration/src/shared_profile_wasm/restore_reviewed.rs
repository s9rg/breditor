//! Explicit reviewed recovery. Existing factories never infer or reinterpret this family.
use super::{RichReplicaProbe, SharedRichProfile, error};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl SharedRichProfile {
    /// Separate exact reviewed-history recovery capability, not a live role or credential.
    #[allow(clippy::unused_self)]
    pub fn reviewed_history_version(&self) -> String {
        "1".into()
    }
    /// Recover only the reviewed family after reacquiring the saved writer's exclusive lease.
    pub fn restore_reviewed(&self, room: &str, input: &str) -> Result<RichReplicaProbe, JsValue> {
        self.inner.restore_reviewed(room, input).map(RichReplicaProbe::from_replica).map_err(error)
    }
}
