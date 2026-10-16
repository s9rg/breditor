//! Explicit pure external-interchange admission; never a mutation or fallback paste.
use super::{BreditorRichEditor, error};
use crate::BreditorStringResult;
use breditor_core::{codec::RichClipboardJsonCodec, rich_content::RichClipboardKind};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 declares context-bound root admission and canonical clipboard validation.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=clipboardInterchangeVersion)]
    pub fn clipboard_interchange_version(&self) -> String {
        "1".to_owned()
    }
    /// Admit an adapter's neutral root and return the original semantic transfer family.
    /// This pure read neither reserves destination IDs nor changes read-only/history/selection.
    #[must_use]
    #[wasm_bindgen(js_name=admitClipboardRoot)]
    pub fn admit_clipboard_root(&self, kind: &str, root_json: &str) -> BreditorStringResult {
        let codec = RichClipboardJsonCodec::new(self.inner.context().clone());
        let value = clipboard_kind(kind)
            .and_then(|kind| codec.admit_root(kind, root_json).ok())
            .and_then(|fragment| codec.encode_transfer(&fragment).ok());
        result(value)
    }
    /// Revalidate a clipboard for export under this exact receiving schema and resource policy.
    #[must_use]
    #[wasm_bindgen(js_name=validateClipboard)]
    pub fn validate_clipboard(&self, clipboard_json: &str) -> BreditorStringResult {
        let codec = RichClipboardJsonCodec::new(self.inner.context().clone());
        result(codec.decode(clipboard_json).and_then(|value| codec.encode_transfer(&value)).ok())
    }
}

fn clipboard_kind(kind: &str) -> Option<RichClipboardKind> {
    match kind {
        "text" => Some(RichClipboardKind::Text),
        "flow" => Some(RichClipboardKind::Flow),
        "grid" => Some(RichClipboardKind::Grid),
        _ => None,
    }
}
fn result(value: Option<String>) -> BreditorStringResult {
    value.map_or_else(
        || BreditorStringResult::from_error(error::rejected("breditor_rich.clipboard_interchange")),
        BreditorStringResult::from_value,
    )
}
