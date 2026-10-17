//! Opt-in local history ownership. Server finalization and authentication remain host-owned.
mod adopt;
mod enable;
mod verify_effect;
use super::{RichReplicaProbe, error};
use crate::rich_replica::DocumentSuggestionEffectVerification;
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Disposable native semantic proof or explicit Pending, never an effect executor or credential.
#[wasm_bindgen(js_name = SharedSuggestionEffectProof)]
pub struct RichSuggestionEffectProof {
    inner: DocumentSuggestionEffectVerification,
}
#[wasm_bindgen(js_class = SharedSuggestionEffectProof)]
impl RichSuggestionEffectProof {
    /// Frozen original proposal/effect metadata. Matching strings do not authenticate a decision.
    pub fn summary_json(&self) -> String {
        match &self.inner {
            DocumentSuggestionEffectVerification::Pending { missing } => {
                json!({"kind":"pending","missing":missing})
            }
            DocumentSuggestionEffectVerification::Verified(proof) => {
                json!({"kind":"verified","suggestion":proof.info(),"effect":proof.effect()})
            }
        }
        .to_string()
    }
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Complete separate history/proof pairing. Old owners can omit it without changing defaults.
    #[allow(clippy::unused_self)]
    pub fn reviewed_history_version(&self) -> String {
        "1".into()
    }
    /// Explicitly selected local recovery contract, not a server grant.
    pub fn reviewed_history_enabled(&self) -> bool {
        self.inner.reviewed_history_enabled()
    }
    /// Pinned nonsecret identity or null. Recovery does not authenticate the current account.
    pub fn reviewed_history_identity_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.reviewed_history_identity()).map_err(error)
    }
    /// Original once-only adoption or null, even after Undo or a discarded Redo branch.
    pub fn adopted_suggestion_json(&self, id: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.inner.adopted_suggestion(id)).map_err(error)
    }
    /// Save only the explicitly selected reviewed family; never fall back to an older encoder.
    pub fn reviewed_checkpoint(&self) -> Result<String, JsValue> {
        self.inner.reviewed_checkpoint().map_err(error)
    }
    /// Reject stale/foreign proofs before any consumer uses them as current owned-history evidence.
    pub fn check_document_suggestion_effect_proof(
        &self,
        prepared: &RichSuggestionEffectProof,
    ) -> Result<(), JsValue> {
        let DocumentSuggestionEffectVerification::Verified(proof) = &prepared.inner else {
            return Err(error(crate::Error::Contract("suggestion effect is not verified")));
        };
        self.inner.check_document_suggestion_effect_proof(proof).map_err(error)
    }
}
