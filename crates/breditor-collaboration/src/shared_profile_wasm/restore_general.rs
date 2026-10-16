//! Separate semantic-history factories; original recovery never guesses a family.
use super::{RichReplicaProbe, SharedRichProfile, error};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl SharedRichProfile {
    /// Recover explicit general-range ordinary history after reacquiring the writer lease.
    pub fn restore_general(&self, room: &str, input: &str) -> Result<RichReplicaProbe, JsValue> {
        self.inner.restore_general(room, input).map(RichReplicaProbe::from_replica).map_err(error)
    }
    /// Recover explicit general-range natural history without flattening its groups.
    pub fn restore_general_typing(
        &self,
        room: &str,
        input: &str,
    ) -> Result<RichReplicaProbe, JsValue> {
        self.inner
            .restore_general_typing(room, input)
            .map(RichReplicaProbe::from_replica)
            .map_err(error)
    }
}
