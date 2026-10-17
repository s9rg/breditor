//! Refuse stale/foreign/disposed or nonready preparations before a UI treats a preview as current.
use super::{
    super::{RichReplicaProbe, error},
    RichSuggestionPreparation,
};
use crate::{Error, rich_replica::DocumentSuggestionPreparation};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Check native proposal identity and exact ownership/publication, never Accept or author.
    pub fn check_document_suggestion_preview(
        &self,
        prepared: &RichSuggestionPreparation,
        suggestion_id: &str,
    ) -> Result<(), JsValue> {
        let DocumentSuggestionPreparation::Ready(preview) = &prepared.inner else {
            return Err(error(Error::Contract("suggestion preview is not ready")));
        };
        if preview.info().id != suggestion_id {
            return Err(error(Error::Contract("suggestion preview proposal identity differs")));
        }
        self.inner.check_document_suggestion_preview(preview).map_err(error)
    }
}
