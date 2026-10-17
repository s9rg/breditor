//! Retain already authenticated owned acceptance once; never execute its commands in the browser.
use super::{
    super::{RichReplicaProbe, error},
    RichSuggestionEffectProof,
};
use crate::{
    Error,
    rich_replica::{DocumentSuggestionEffectVerification, OwnedSuggestionAcceptance},
};
use wasm_bindgen::prelude::*;
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Caller authenticates the original final decision first. Native proof, exact local identity,
    /// repeated receipt and atomic recovery checks remain authoritative. This authors no document op.
    pub fn adopt_suggestion_history(
        &mut self,
        prepared: &RichSuggestionEffectProof,
        packet: &str,
        input: &str,
    ) -> Result<bool, JsValue> {
        let DocumentSuggestionEffectVerification::Verified(proof) = &prepared.inner else {
            return Err(error(Error::Contract("suggestion effect is not verified")));
        };
        self.inner.check_document_suggestion_effect_proof(proof).map_err(error)?;
        if input.len() > 4096 {
            return Err(error(Error::Limit("owned acceptance metadata bytes")));
        }
        let acceptance: OwnedSuggestionAcceptance = serde_json::from_str(input).map_err(error)?;
        self.inner.adopt_suggestion_history_guarded(proof, packet, acceptance).map_err(error)
    }
}
