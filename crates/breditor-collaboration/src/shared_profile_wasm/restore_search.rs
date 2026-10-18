//! Explicit search-family replay after host writer-lease acquisition; no format autodetection.
use super::{RichReplicaProbe, SharedRichProfile, error};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl SharedRichProfile {
    /// Separate optional exact search-family recovery capability.
    #[allow(clippy::unused_self)]
    pub fn search_history_version(&self) -> String {
        "1".into()
    }
    /// Recover exact semantic search history, never permissions, queries or live result objects.
    pub fn restore_search(&self, room: &str, input: &str) -> Result<RichReplicaProbe, JsValue> {
        self.inner.restore_search(room, input).map(RichReplicaProbe::from_replica).map_err(error)
    }
}
