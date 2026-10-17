//! Pure retained-effect semantic verification. No accepted edit, history or publication is changed.
use super::{
    super::{RichReplicaProbe, RichSharedObservation, error},
    RichSuggestionEffectProof,
};
use crate::{Error, rich_replica::DocumentSuggestionEffect};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Prove original lowering/boundary under the current owner, or return explicit Pending.
    pub fn verify_document_suggestion_effect(
        &self,
        observed: &RichSharedObservation,
        packet: &str,
        input: &str,
    ) -> Result<RichSuggestionEffectProof, JsValue> {
        self.inner.check(&observed.inner).map_err(error)?;
        if input.len() > 2048 {
            return Err(error(Error::Limit("suggestion effect metadata bytes")));
        }
        let effect: DocumentSuggestionEffect = serde_json::from_str(input).map_err(error)?;
        Ok(RichSuggestionEffectProof {
            inner: self
                .inner
                .verify_document_suggestion_effect_guarded(&observed.inner, packet, &effect)
                .map_err(error)?,
        })
    }
}
