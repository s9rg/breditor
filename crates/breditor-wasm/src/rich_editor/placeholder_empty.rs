//! Optional guarded prompt read; no persisted/view family is widened.
use super::{BreditorRichEditor, BreditorRichObservation, BreditorRichProfile, error};
use crate::BreditorStringResult;
use breditor_core::rich_content::is_rich_placeholder_empty;
use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
impl BreditorRichProfile {
    /// Check prompt policy before creating or recovering a native editor owner.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=placeholderVersion)]
    pub fn placeholder_version(&self) -> String {
        "1".into()
    }
}

#[wasm_bindgen]
impl BreditorRichEditor {
    /// Independent complete prompt-read capability, revision one.
    #[must_use]
    #[allow(clippy::unused_self)]
    #[wasm_bindgen(js_name=placeholderVersion)]
    pub fn placeholder_version(&self) -> String {
        "1".into()
    }
    /// Return exactly true/false text against the exact owner publication.
    #[must_use]
    #[wasm_bindgen(js_name=placeholderEmpty)]
    pub fn placeholder_empty(&self, observed: &BreditorRichObservation) -> BreditorStringResult {
        if let Err(error) = self.inner.check_observation(&observed.inner) {
            return BreditorStringResult::from_error(error::session(&error));
        }
        BreditorStringResult::from_value(
            is_rich_placeholder_empty(self.inner.state().document()).to_string(),
        )
    }
}
