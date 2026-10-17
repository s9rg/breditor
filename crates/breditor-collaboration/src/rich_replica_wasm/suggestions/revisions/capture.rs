//! Guarded pure revision capture preserves the original descriptive creator and current source.
use super::super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::{Error, rich_replica::DocumentSuggestionDraft};
use serde::Deserialize;
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    previous_packet_json: String,
    title: String,
    created_at_ms: String,
    draft: DocumentSuggestionDraft,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Capture a complete new intent without publishing it, superseding the predecessor or writing
    /// any accepted content/history. Stale guards reject before parsing; author is not supplied.
    pub fn capture_document_suggestion_revision(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if input.len() > 4 * 1024 * 1024 + 8192 {
            return Err(error(Error::Limit("revision capture request bytes")));
        }
        let request: Request = serde_json::from_str(input).map_err(error)?;
        self.inner
            .capture_document_suggestion_revision_guarded(
                &observed.inner,
                &request.previous_packet_json,
                &request.title,
                &request.created_at_ms,
                request.draft,
            )
            .map_err(error)
    }
}
