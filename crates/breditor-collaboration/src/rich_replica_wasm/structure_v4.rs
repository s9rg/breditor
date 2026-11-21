//! Shared V4 structure command capability: sections (`wrap_details`/`unwrap_details`), page
//! breaks (`insert_page_break`/`delete_page_break`) and table captions
//! (`add_table_caption`/`remove_table_caption`) dispatched through the ordinary command batch.
use super::RichReplicaProbe;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// "1" only for an explicit shared V4 owner (model 14), whose dispatch admits the six
    /// structure commands; "0" otherwise (older owners refuse them).
    #[must_use]
    pub fn structure_commands_v4_version(&self) -> String {
        if self.inner.rich_language_version() == 4 { "1" } else { "0" }.into()
    }
}
