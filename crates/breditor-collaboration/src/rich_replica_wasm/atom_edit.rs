//! Optional guarded atom edits; original causal commands and saved formats are retained.
mod delete_atom;
mod replace_atom_plain_text;
mod replace_atom_typing_text;
use super::RichReplicaProbe;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 supports native whole-atom deletion, plain and first-key replacement.
    #[allow(clippy::unused_self)]
    #[must_use]
    pub fn atom_edit_version(&self) -> String {
        "1".to_owned()
    }
}
