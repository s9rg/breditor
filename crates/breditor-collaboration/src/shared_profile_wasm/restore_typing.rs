//! Explicit new-family factory; old restore never guesses or drops grouping.
use super::{RichReplicaProbe, SharedRichProfile, error};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl SharedRichProfile {
    /// Version of the separate native typing-history recovery capability.
    #[allow(clippy::unused_self)]
    pub fn typing_history_version(&self) -> String {
        "1".to_owned()
    }
    /// Resume grouped future history with fresh continuation and no saved host permission.
    pub fn restore_typing(&self, room: &str, input: &str) -> Result<RichReplicaProbe, JsValue> {
        self.inner.restore_typing(room, input).map(RichReplicaProbe::from_replica).map_err(error)
    }
}
