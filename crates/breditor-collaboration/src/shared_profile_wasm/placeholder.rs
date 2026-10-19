//! Admit an optional prompt before opening a durable writer or its storage.
use super::SharedRichProfile;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl SharedRichProfile {
    /// Independent native prompt policy capability, revision one.
    #[allow(clippy::unused_self)]
    pub fn placeholder_version(&self) -> String {
        "1".into()
    }
}
