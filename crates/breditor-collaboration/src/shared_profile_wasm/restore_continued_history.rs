//! Restore the explicit continued archive after actual host writer fencing.
use super::{RichReplicaProbe, SharedRichProfile, error};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl SharedRichProfile {
    /// Replay the preserved V1 prefix and all later same-writer history.
    pub fn restore_continued_history(
        &self,
        room: &str,
        input: &str,
    ) -> Result<RichReplicaProbe, JsValue> {
        self.inner
            .restore_continued_history(room, input)
            .map(RichReplicaProbe::from_replica)
            .map_err(error)
    }
}
