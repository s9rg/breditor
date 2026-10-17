//! Socket Accept is always owned by the exact current connection lease; Reject has no document effect.
use super::{ConnectionState, Host, Result};
use crate::{
    DocumentSuggestionDecisionAdmission, Error, SuggestionDecision, SuggestionDecisionRequest,
};
use serde_json::{Value, json};
pub(super) async fn decide(
    host: &Host,
    principal: String,
    state: ConnectionState,
    request: SuggestionDecisionRequest,
) -> Result<Value> {
    let admission = host
        .transaction(move |room| {
            state.validate(room, &principal)?;
            match request.decision {
                SuggestionDecision::Accept => {
                    if state.observer {
                        return Err(Error::Lease);
                    }
                    let lease = state.lease.as_ref().ok_or(Error::Lease)?;
                    room.accept_document_suggestion_owned(&principal, lease, &request)
                }
                SuggestionDecision::Reject => room.decide_document_suggestion(&principal, &request),
            }
        })
        .await?;
    if let DocumentSuggestionDecisionAdmission::Durable(receipt) = &admission
        && !receipt.duplicate
    {
        host.notify_document_suggestions();
        if receipt.decision.effect.is_some() {
            host.notify();
        }
    }
    Ok(json!({"kind":"suggestionDecisionAdmission","admission":admission}))
}
