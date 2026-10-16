//! Explicit document-selection factories; old/general recovery never guesses a newer family.
use super::{RichReplicaProbe, SharedRichProfile, error};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl SharedRichProfile {
    /// String1 declares both explicit document-selection recovery families.
    #[allow(clippy::unused_self)]
    pub fn document_selection_version(&self) -> String {
        "1".into()
    }
    /// Recover ordinary document-selection selective history after reacquiring the exact writer lease.
    pub fn restore_document(&self, room: &str, input: &str) -> Result<RichReplicaProbe, JsValue> {
        self.inner.restore_document(room, input).map(RichReplicaProbe::from_replica).map_err(error)
    }
    /// Recover natural document-selection selective history without flattening native groups.
    pub fn restore_document_typing(
        &self,
        room: &str,
        input: &str,
    ) -> Result<RichReplicaProbe, JsValue> {
        self.inner
            .restore_document_typing(room, input)
            .map(RichReplicaProbe::from_replica)
            .map_err(error)
    }
}
