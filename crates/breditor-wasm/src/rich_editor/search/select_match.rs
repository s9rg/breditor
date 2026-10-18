//! Guarded native match selection, including read-only navigation without clearing Redo.
use super::{
    super::{BreditorRichCommandResult, BreditorRichEditor, BreditorRichObservation, error},
    BreditorRichSearchResults,
};
use breditor_core::codec::decode_rich_search_index;
use wasm_bindgen::prelude::wasm_bindgen;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// Select one source-proved match using a canonical string index and current observation.
    #[must_use]
    #[wasm_bindgen(js_name=selectSearchMatch)]
    pub fn select_search_match(
        &mut self,
        observed: &BreditorRichObservation,
        results: &BreditorRichSearchResults,
        index: &str,
    ) -> BreditorRichCommandResult {
        let selected = (|| {
            self.check_search(observed, results)?;
            let index = decode_rich_search_index(index)
                .map_err(|_| error::rejected("breditor_rich.search_index"))?;
            let selection = results
                .inner
                .selection(index)
                .map_err(|_| error::rejected("breditor_rich.search_index"))?;
            self.inner
                .set_selection(&observed.inner, Some(selection.kind().clone()))
                .map_err(|e| error::session(&e))
        })();
        match selected {
            Ok(outcome) => BreditorRichCommandResult::success(outcome, self.observe()),
            Err(e) => BreditorRichCommandResult::failure(e),
        }
    }
}
