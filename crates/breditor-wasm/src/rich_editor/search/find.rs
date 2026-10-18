//! Pure guarded query; no selection, history entry or persisted query is created.
use super::{
    super::{BreditorRichEditor, BreditorRichObservation, error},
    BreditorRichSearchResults, BreditorRichSearchResultsResult,
};
use breditor_core::{
    codec::{decode_rich_search_query, encode_rich_search_results},
    rich_content::find_rich_text,
};
use std::sync::Arc;
use wasm_bindgen::prelude::wasm_bindgen;
#[wasm_bindgen]
impl BreditorRichEditor {
    /// Search the current exact owner, including read-only mode. At most eight reads may stay live.
    /// Dispose/free a previous read to release capacity; no live result is silently evicted.
    #[must_use]
    #[wasm_bindgen(js_name=findText)]
    pub fn find_text(
        &self,
        observed: &BreditorRichObservation,
        input: &str,
    ) -> BreditorRichSearchResultsResult {
        let found = (|| {
            self.inner.check_observation(&observed.inner).map_err(|e| error::session(&e))?;
            if Arc::strong_count(&self.search_owner) > 8 {
                return Err(error::rejected("breditor_rich.search_handles"));
            }
            let query = decode_rich_search_query(input)
                .map_err(|_| error::rejected("breditor_rich.search_query"))?;
            let inner = find_rich_text(self.inner.state().document(), &query)
                .map_err(|_| error::rejected("breditor_rich.search_query"))?;
            let metadata = encode_rich_search_results(self.inner.state().document(), &inner)
                .map_err(|_| error::rejected("breditor_rich.search_metadata"))?;
            Ok(BreditorRichSearchResults { owner: Arc::clone(&self.search_owner), inner, metadata })
        })();
        match found {
            Ok(results) => BreditorRichSearchResultsResult::success(results),
            Err(e) => BreditorRichSearchResultsResult::failure(e),
        }
    }
}
