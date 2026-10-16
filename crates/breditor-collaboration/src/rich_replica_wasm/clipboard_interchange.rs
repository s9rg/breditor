//! Separate opt-in interchange ABI; original shared clipboard and stored formats stay unchanged.
use super::{RichReplicaProbe, error};
use breditor_core::rich_content::RichClipboardKind;
use wasm_bindgen::prelude::*;

#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// String1 declares both pure interchange entry points; no runtime fallback is inferred.
    #[allow(clippy::unused_self)]
    pub fn clipboard_interchange_version(&self) -> String {
        "1".to_owned()
    }
    /// Admit a neutral source root using the receiving context, without authoring an edit.
    pub fn admit_clipboard_root(&self, kind: &str, root_json: &str) -> Result<String, JsValue> {
        let kind = match kind {
            "text" => RichClipboardKind::Text,
            "flow" => RichClipboardKind::Flow,
            "grid" => RichClipboardKind::Grid,
            _ => return Err(error("unsupported clipboard interchange kind")),
        };
        self.inner.admit_clipboard_root(kind, root_json).map_err(error)
    }
    /// Revalidate native semantic clipboard content for a separately opted-in exporter.
    pub fn validate_clipboard(&self, input: &str) -> Result<String, JsValue> {
        self.inner.validate_clipboard(input).map_err(error)
    }
}
