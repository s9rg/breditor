//! Candidate V4 bookmarks and internal links: capability, exact inventory read and
//! the `setBookmark` / `renameBookmark` commands (see `command::bookmark`).
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorStringResult;
use breditor_core::rich_content::RichBookmarkIndex;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 selects candidate V4 bookmarks and internal `#name` links (`setBookmark`,
    /// `renameBookmark`, `bookmarkIndexJson`); String0 means unsupported.
    #[must_use]
    #[wasm_bindgen(js_name=bookmarkVersion)]
    pub fn bookmark_version(&self) -> String {
        if self.inner.context().schema().supports_rich_bookmarks() { "1" } else { "0" }.into()
    }
}

#[wasm_bindgen]
impl BreditorRichObservation {
    /// Read `{"bookmarks":[{"name","block"}],"links":[{"block","target"}],
    /// "brokenLinks":[{"block","target"}]}` in document order from this frozen snapshot.
    /// A broken link targets a name no block carries.
    #[must_use]
    #[wasm_bindgen(js_name=bookmarkIndexJson)]
    pub fn bookmark_index_json(&self) -> BreditorStringResult {
        let state = self.inner.state();
        match RichBookmarkIndex::read(&self.context, state.document()) {
            Ok(index) => {
                let link = |link: &breditor_core::rich_content::RichInternalLink| {
                    serde_json::json!({
                        "block": link.block().as_str(),
                        "target": link.target().as_str(),
                    })
                };
                let value = serde_json::json!({
                    "bookmarks": index.bookmarks().iter().map(|entry| serde_json::json!({
                        "name": entry.name().as_str(),
                        "block": entry.block().as_str(),
                    })).collect::<Vec<_>>(),
                    "links": index.links().iter().map(link).collect::<Vec<_>>(),
                    "brokenLinks": index.broken_links().into_iter().map(link).collect::<Vec<_>>(),
                });
                BreditorStringResult::from_value(value.to_string())
            }
            Err(_) => BreditorStringResult::from_error(error::rejected("breditor_rich.bookmark")),
        }
    }
}
