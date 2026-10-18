//! Frozen independently disposable matches; no serialized data grants writer authority.
use super::super::error;
use breditor_core::codec::decode_rich_search_navigation;
use std::sync::Arc;
use wasm_bindgen::prelude::*;
/// Complete native matches bound to one actor and causal source, with at most eight live reads per actor.
#[wasm_bindgen(js_name=SharedSearchResults)]
pub struct RichSharedSearchResults {
    pub(super) inner: crate::rich_replica::SharedSearchResults,
    pub(super) metadata: String,
    pub(super) _lease: Arc<()>,
}
#[wasm_bindgen(js_class=SharedSearchResults)]
impl RichSharedSearchResults {
    /// Complete bounded immutable metadata; counts and UTF-16 endpoints are decimal strings.
    pub fn metadata_json(&self) -> String {
        self.metadata.clone()
    }
    /// Pure native semantic navigation, without selecting or creating history.
    pub fn navigate(&self, input: &str) -> Result<Option<String>, JsValue> {
        decode_rich_search_navigation(self.inner.results(), input).map_err(error)
    }
}
