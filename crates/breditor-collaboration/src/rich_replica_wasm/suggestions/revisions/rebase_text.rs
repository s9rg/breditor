//! Optional pure complete-text revision capture, never a document edit or final decision.
use super::super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::{Error, rich_replica::DocumentSuggestionTextRebasePolicy};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    previous_packet_json: String,
    title: String,
    created_at_ms: String,
    prefix: String,
    policy: DocumentSuggestionTextRebasePolicy,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Independent complete pure text-rebase capability; no default policy is inferred.
    #[allow(clippy::unused_self)]
    pub fn suggestion_text_rebase_version(&self) -> String {
        "1".into()
    }
    /// Capture only original native intent, with explicit peer-text policy and host-fresh IDs.
    /// Prefixes remain consumed on refusal/discard. Missing/unknown policies and extra fields
    /// reject; no scalar IDs, weaker witnesses, author override or JavaScript fallback is admitted.
    pub fn rebase_document_suggestion_text(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if input.len() > 2 * 1024 * 1024 + 8192 {
            return Err(error(Error::Limit("text rebase request bytes")));
        }
        let request: Request = serde_json::from_str(input).map_err(error)?;
        let result = self
            .inner
            .rebase_document_suggestion_text_guarded(
                &observed.inner,
                &request.previous_packet_json,
                &request.title,
                &request.created_at_ms,
                &request.prefix,
                request.policy,
            )
            .map_err(error)?;
        serde_json::to_string(&result).map_err(error)
    }
}
