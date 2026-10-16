//! Explicit whole-document navigation capability, independent from prior selection/paste support.
use super::{BreditorRichCommandResult, BreditorRichEditor, BreditorRichObservation, error};
use breditor_core::rich_content::FlowMove;
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// String1 declares native start/end collapse without synthetic endpoints or content edits.
    #[allow(clippy::unused_self)]
    #[must_use]
    #[wasm_bindgen(js_name = documentNavigationVersion)]
    pub fn document_navigation_version(&self) -> String {
        "1".into()
    }
    /// Collapse to `before` (logical start) or `after` (logical end); hidden-only content stays selected.
    #[must_use]
    #[wasm_bindgen(js_name = collapseDocumentSelection)]
    pub fn collapse_document_selection(
        &mut self,
        observation: &BreditorRichObservation,
        side: &str,
    ) -> BreditorRichCommandResult {
        if let Err(e) = self.inner.validate_observation(&observation.inner) {
            return BreditorRichCommandResult::failure(error::session(&e));
        }
        let side = match side {
            "before" => FlowMove::Before,
            "after" => FlowMove::After,
            _ => {
                return BreditorRichCommandResult::failure(error::rejected(
                    "breditor_rich.document_navigation_side",
                ));
            }
        };
        match self.inner.collapse_document_selection(&observation.inner, side) {
            Ok(outcome) => BreditorRichCommandResult::success(outcome, self.observe()),
            Err(e) => BreditorRichCommandResult::failure(error::session(&e)),
        }
    }
}
