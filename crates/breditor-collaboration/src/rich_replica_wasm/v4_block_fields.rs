//! Shared V4 block-field commands: capability, the guarded section open/collapse and the
//! bookmark inventory read. `set_list_numbering`, `set_bookmark` and `rename_bookmark`
//! are ordinary `dispatch` commands.
use super::{RichReplicaProbe, RichSharedObservation, error};
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// "1" when this V4 owner accepts the list-numbering, bookmark, rename and
    /// section-open commands; "0" for V1–V3 owners.
    #[must_use]
    pub fn v4_block_fields_version(&self) -> String {
        if self.inner.rich_language_version() == 4 { "1" } else { "0" }.into()
    }
    /// Expand or collapse one section; collapsing moves a hidden selection to the summary end.
    pub fn set_details_open(
        &mut self,
        observation: &RichSharedObservation,
        block: &str,
        open: bool,
    ) -> Result<bool, JsValue> {
        self.inner.set_details_open_guarded(&observation.inner, block, open).map_err(error)
    }
    /// `{"bookmarks":[{name,block}],"links":[{block,target}],"brokenLinks":[{block,target}]}`.
    pub fn bookmark_index_json(
        &self,
        observation: &RichSharedObservation,
    ) -> Result<String, JsValue> {
        self.inner.bookmark_index_json(&observation.inner).map_err(error)
    }
}
