//! Frozen observation-scoped clipboard conversion, separately selected before any mutation.
use super::{BreditorRichEditor, BreditorRichObservation, error, selection::SelectionRecord};
use crate::BreditorStringResult;
use breditor_core::{codec::RichClipboardJsonCodec, rich_content::RichSelection};
use serde::Deserialize;
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Record {
    selection: SelectionRecord,
    clipboard_json: String,
}
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 declares explicit native caption/code text projection and loss reporting.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=clipboardTextPolicyVersion)]
    pub fn clipboard_text_policy_version(&self) -> String {
        "1".to_owned()
    }
}
#[wasm_bindgen]
impl BreditorRichObservation {
    /// Pure read from this frozen source. Prose returns JSON null; malformed/empty transfers reject.
    #[must_use]
    #[wasm_bindgen(js_name=projectClipboardText)]
    pub fn project_clipboard_text(&self, input: &str) -> BreditorStringResult {
        let project = || -> Option<String> {
            if input.len() > 2 * 1024 * 1024 {
                return None;
            }
            let r: Record = serde_json::from_str(input).ok()?;
            let clipboard =
                RichClipboardJsonCodec::new(self.context.clone()).decode(&r.clipboard_json).ok()?;
            let selection = RichSelection::try_new(
                self.inner.state().document(),
                r.selection.into_kind().ok()?,
            )
            .ok()?;
            let report = clipboard
                .project_text_for_selection(self.inner.state().document(), &selection)
                .ok()?;
            serde_json::to_string(&report).ok()
        };
        project().map_or_else(
            || {
                BreditorStringResult::from_error(error::rejected(
                    "breditor_rich.clipboard_text_projection",
                ))
            },
            BreditorStringResult::from_value,
        )
    }
}
