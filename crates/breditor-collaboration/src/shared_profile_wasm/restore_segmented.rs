//! Explicit segmented recovery factory. No original-family format inference or writer grant.
use super::{RichReplicaProbe, SharedRichProfile, error};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl SharedRichProfile {
    /// Discover the separately named native segmented-history version-one replay contract.
    #[allow(clippy::unused_self)]
    pub fn segmented_history_version(&self) -> String {
        "1".into()
    }
    /// Replay every retained original input and exact native effect after host writer fencing.
    pub fn restore_segmented(&self, room: &str, input: &str) -> Result<RichReplicaProbe, JsValue> {
        self.inner.restore_segmented(room, input).map(RichReplicaProbe::from_replica).map_err(error)
    }
}
