//! Explicit general-range editing capability, separate from old range and history defaults.
mod enable_general_ranges;
mod replace_general_range_plain_text;
mod replace_general_range_text;
mod replace_general_range_typing_text;
use super::RichReplicaProbe;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 supports explicit native general targets and matching semantic history.
    #[allow(clippy::unused_self)]
    pub fn general_range_version(&self) -> String {
        "1".to_owned()
    }
}
