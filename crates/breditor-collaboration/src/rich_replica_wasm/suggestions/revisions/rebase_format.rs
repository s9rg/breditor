//! Optional pure formatting rebase into unchanged immutable revision bytes, never Accept.
use super::super::super::{RichReplicaProbe, RichSharedObservation, error};
use crate::Error;
use serde::Deserialize;
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    previous_packet_json: String,
    title: String,
    created_at_ms: String,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature="research"),wasm_bindgen(js_class=SharedEditorOwner))]
impl RichReplicaProbe {
    /// Separate pure optional capability. Existing proposal/revision V1 meanings are unchanged.
    #[allow(clippy::unused_self)]
    pub fn suggestion_format_rebase_version(&self) -> String {
        "1".into()
    }
    /// Return Pending/Conflict/Unsupported or exact revision bytes, without accepted edits,
    /// predecessor supersession, author substitution, independent child publication or fallback.
    pub fn rebase_document_suggestion_format(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if input.len() > 2 * 1024 * 1024 + 8192 {
            return Err(error(Error::Limit("format rebase request bytes")));
        }
        let request: Request = serde_json::from_str(input).map_err(error)?;
        let result = self
            .inner
            .rebase_document_suggestion_format_guarded(
                &observed.inner,
                &request.previous_packet_json,
                &request.title,
                &request.created_at_ms,
            )
            .map_err(error)?;
        serde_json::to_string(&result).map_err(error)
    }
}
