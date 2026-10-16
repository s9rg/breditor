//! Separate native general-input commands; original range commands keep their meanings.
use super::BreditorRichEditor;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 supports atomic general-range rich flow paste at retained prose starts.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=generalFlowPasteVersion)]
    pub fn general_flow_paste_version(&self) -> String {
        "1".to_owned()
    }
    /// String1 supports observation-scoped general Copy with empty unselected table cells.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=generalCopyVersion)]
    pub fn general_copy_version(&self) -> String {
        "1".to_owned()
    }
    /// String1 supports strict native inline clipboard decoding at an explicit general target.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=generalInlinePasteVersion)]
    pub fn general_inline_paste_version(&self) -> String {
        "1".to_owned()
    }
    /// String1 supports explicit rich/plain/typing targets and native floor allocation.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name=generalRangeVersion)]
    pub fn general_range_version(&self) -> String {
        "1".to_owned()
    }
}
