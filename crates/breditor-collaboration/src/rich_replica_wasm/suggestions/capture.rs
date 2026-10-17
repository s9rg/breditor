//! Capture an attributed immutable source-bound intent without changing the accepted document.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::{Error, rich_replica::DocumentSuggestionDraft};
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde::Deserialize;
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Request {
    title: String,
    author: ReviewPrincipalId,
    created_at_ms: String,
    draft: DocumentSuggestionDraft,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Complete separate pure suggestion capture/source/preview and retained-receipt capability.
    #[allow(clippy::unused_self)]
    pub fn document_suggestions_version(&self) -> String {
        "1".into()
    }
    /// Host author/time are descriptive claims until independently authenticated on publication.
    pub fn capture_document_suggestion(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if input.len() > 1024 * 1024 {
            return Err(error(Error::Limit("suggestion capture request bytes")));
        }
        let request: Request = serde_json::from_str(input).map_err(error)?;
        self.inner
            .capture_document_suggestion_guarded(
                &observed.inner,
                &request.title,
                request.author,
                &request.created_at_ms,
                request.draft,
            )
            .map_err(error)
    }
}
