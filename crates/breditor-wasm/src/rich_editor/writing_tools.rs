//! Optional guarded writing reads; original views and command unions stay closed.
use super::{BreditorRichEditor, BreditorRichObservation, error};
use crate::BreditorStringResult;
use breditor_core::codec::encode_rich_writing_tools;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl BreditorRichEditor {
    /// Independent complete native counts/outline capability, string revision one.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=writingToolsVersion)]
    pub fn writing_tools_version(&self) -> String {
        "1".into()
    }
    /// Read accepted content against the exact owner publication, including read-only mode.
    #[must_use]
    #[wasm_bindgen(js_name=writingToolsJson)]
    pub fn writing_tools_json(&self, observed: &BreditorRichObservation) -> BreditorStringResult {
        let value = (|| {
            self.inner.check_observation(&observed.inner).map_err(|e| error::session(&e))?;
            encode_rich_writing_tools(
                self.inner.state().document(),
                self.inner.state().revision().get(),
            )
            .map_err(|_| error::rejected("breditor_rich.writing_tools_read"))
        })();
        match value {
            Ok(value) => BreditorStringResult::from_value(value),
            Err(error) => BreditorStringResult::from_error(error),
        }
    }
}
