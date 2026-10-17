//! Capture a named semantic snapshot; host authentication/storage stays separate from document content.
use super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::Error;
use breditor_core::rich_content::review::ReviewPrincipalId;
use serde::Deserialize;
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Request {
    name: String,
    author: ReviewPrincipalId,
    created_at_ms: String,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Complete separate native version capture/compare/restore capability.
    #[allow(clippy::unused_self)]
    pub fn document_versions_version(&self) -> String {
        "1".into()
    }
    /// Capture current accepted content without local Undo, writer credentials or review metadata.
    pub fn capture_document_version(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if input.len() > 2048 {
            return Err(error(Error::Limit("version capture request")));
        }
        let r: Request = serde_json::from_str(input).map_err(error)?;
        self.inner
            .capture_document_version_guarded(&observed.inner, &r.name, r.author, &r.created_at_ms)
            .map_err(error)
    }
}
