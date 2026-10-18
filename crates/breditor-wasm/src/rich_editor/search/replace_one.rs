//! One guarded native match replacement; real UI and exact old local history are retained.
use super::{
    super::{BreditorRichCommandResult, BreditorRichEditor, BreditorRichObservation, error},
    BreditorRichSearchResults,
};
use breditor_core::codec::{decode_rich_search_index, decode_rich_search_replacement};
use wasm_bindgen::prelude::wasm_bindgen;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// Replace one source-proved hit without changing the old execute command union.
    #[must_use]
    #[wasm_bindgen(js_name=replaceSearchOne)]
    pub fn replace_search_one(
        &mut self,
        observed: &BreditorRichObservation,
        results: &BreditorRichSearchResults,
        index: &str,
        input: &str,
    ) -> BreditorRichCommandResult {
        let replaced = (|| {
            self.check_search(observed, results)?;
            let index = decode_rich_search_index(index)
                .map_err(|_| error::rejected("breditor_rich.search_index"))?;
            let replacement = decode_rich_search_replacement(input)
                .map_err(|_| error::rejected("breditor_rich.search_replacement"))?;
            self.inner
                .replace_search_one(&observed.inner, &results.inner, index, &replacement)
                .map_err(|e| error::session(&e))
        })();
        match replaced {
            Ok(outcome) => BreditorRichCommandResult::success(outcome, self.observe()),
            Err(e) => BreditorRichCommandResult::failure(e),
        }
    }
}
