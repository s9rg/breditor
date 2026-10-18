//! Complete source-proved replacement as one native history group, never a JS edit loop.
use super::{
    super::{BreditorRichCommandResult, BreditorRichEditor, BreditorRichObservation, error},
    BreditorRichSearchResults,
};
use breditor_core::codec::decode_rich_search_replacement;
use wasm_bindgen::prelude::wasm_bindgen;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// Replace all complete native hits atomically. Invalid/stale input publishes no prefix.
    #[must_use]
    #[wasm_bindgen(js_name=replaceSearchAll)]
    pub fn replace_search_all(
        &mut self,
        observed: &BreditorRichObservation,
        results: &BreditorRichSearchResults,
        input: &str,
    ) -> BreditorRichCommandResult {
        let replaced = (|| {
            self.check_search(observed, results)?;
            let replacement = decode_rich_search_replacement(input)
                .map_err(|_| error::rejected("breditor_rich.search_replacement"))?;
            self.inner
                .replace_search_all(&observed.inner, &results.inner, &replacement)
                .map_err(|e| error::session(&e))
        })();
        match replaced {
            Ok(outcome) => BreditorRichCommandResult::success(outcome, self.observe()),
            Err(e) => BreditorRichCommandResult::failure(e),
        }
    }
}
