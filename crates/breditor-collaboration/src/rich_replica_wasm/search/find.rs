//! Pure live guarded query; reject excess live handles before compiling or copying metadata.
use super::{
    super::{RichReplicaProbe, RichSharedObservation, error},
    RichSharedSearchResults,
};
use breditor_core::codec::{decode_rich_search_query, encode_rich_search_results};
use std::sync::Arc;
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Search accepted text under an exact current observation, without enabling mutable history.
    pub fn find_text(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<RichSharedSearchResults, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if Arc::strong_count(&self.search_reads) > 8 {
            return Err(error("shared search live result limit"));
        }
        let query = decode_rich_search_query(input).map_err(error)?;
        let inner = self.inner.find_text_guarded(&observed.inner, &query).map_err(error)?;
        let metadata =
            encode_rich_search_results(self.inner.document(), inner.results()).map_err(error)?;
        Ok(RichSharedSearchResults { inner, metadata, _lease: Arc::clone(&self.search_reads) })
    }
}
