//! Explicit shared rich-language capability reads; V4 names each frozen slice.
use super::RichReplicaProbe;
use wasm_bindgen::prelude::*;
fn v4(owner: &RichReplicaProbe) -> String {
    if owner.inner.rich_language_version() == 4 { "1" } else { "0" }.into()
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// The selected rich language as a decimal string: "1" through "4".
    #[must_use]
    pub fn rich_language_version(&self) -> String {
        self.inner.rich_language_version().to_string()
    }
    /// "1" only for an explicit shared V4 owner (model 14).
    #[must_use]
    pub fn list_numbering_version(&self) -> String {
        v4(self)
    }
    /// "1" only for an explicit shared V4 owner (model 14).
    #[must_use]
    pub fn text_language_version(&self) -> String {
        v4(self)
    }
    /// "1" only for an explicit shared V4 owner (model 14).
    #[must_use]
    pub fn image_link_version(&self) -> String {
        v4(self)
    }
    /// "1" only for an explicit shared V4 owner (model 14).
    #[must_use]
    pub fn details_version(&self) -> String {
        v4(self)
    }
    /// "1" only for an explicit shared V4 owner (model 14).
    #[must_use]
    pub fn mention_version(&self) -> String {
        v4(self)
    }
    /// "1" only for an explicit shared V4 owner (model 14).
    #[must_use]
    pub fn table_caption_version(&self) -> String {
        v4(self)
    }
    /// "1" only for an explicit shared V4 owner (model 14).
    #[must_use]
    pub fn page_break_version(&self) -> String {
        v4(self)
    }
    /// "1" only for an explicit shared V4 owner (model 14).
    #[must_use]
    pub fn bookmark_version(&self) -> String {
        v4(self)
    }
}
