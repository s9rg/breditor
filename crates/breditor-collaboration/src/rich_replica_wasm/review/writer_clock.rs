//! Additive native transport lineage reads; no JavaScript causal ledger is reconstructed.
use super::{
    ReviewActorId, ReviewPrincipalId, RichReplicaProbe, RichSharedObservation, decode, error,
};
use crate::Error;
use serde::Deserialize;
use wasm_bindgen::prelude::*;
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Prefix {
    actor: ReviewActorId,
    principal: ReviewPrincipalId,
    through: Option<String>,
}
#[cfg_attr(feature = "research", wasm_bindgen)]
#[cfg_attr(not(feature = "research"), wasm_bindgen(js_class = SharedEditorOwner))]
impl RichReplicaProbe {
    /// Separate capability: original review runtimes remain useful without transport proofs.
    #[allow(clippy::unused_self)]
    pub fn review_transport_version(&self) -> String {
        "1".into()
    }
    /// Exact own actor and prefix; native principal binding is not inferred from a checkpoint header.
    pub fn local_review_clock(&self, observed: &RichSharedObservation) -> Result<String, JsValue> {
        self.check_review(observed)?;
        let review = self.review.as_ref().ok_or_else(|| error("review unavailable"))?;
        serde_json::to_string(&review.local_writer_clock().map_err(error)?).map_err(error)
    }
    /// Read a known current/historical prefix under its exact principal binding, including genesis.
    pub fn review_writer_clock(
        &self,
        observed: &RichSharedObservation,
        input: &str,
    ) -> Result<String, JsValue> {
        self.check_review(observed)?;
        let request: Prefix = decode(input, 2048)?;
        let review = self.review.as_ref().ok_or_else(|| error("review unavailable"))?;
        let clock = if let Some(through) = request.through {
            let counter = through
                .parse::<u64>()
                .map_err(|_| error(Error::Contract("review prefix counter")))?;
            if through.len() > 20 || counter.to_string() != through {
                return Err(error(Error::Contract("canonical review prefix counter")));
            }
            review.writer_clock_at(&request.actor, &request.principal, counter)
        } else {
            review.writer_clock(&request.actor, &request.principal)
        }
        .map_err(error)?;
        serde_json::to_string(&clock).map_err(error)
    }
}
