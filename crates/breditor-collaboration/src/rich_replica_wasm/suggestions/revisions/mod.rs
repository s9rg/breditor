//! Additive pure immutable-revision boundary. No server supersession or accepted edit executor.
mod capture;
mod packet;
mod read;
mod verify;
use super::super::RichReplicaProbe;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Complete separate pure capture, descriptive/source reads and exact replacement extraction.
    #[allow(clippy::unused_self)]
    pub fn document_suggestion_revisions_version(&self) -> String {
        "1".into()
    }
}
