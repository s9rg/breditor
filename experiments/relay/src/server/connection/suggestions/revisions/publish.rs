//! Current account rights and native pending-only transaction precede every durable reply.
use super::{ConnectionState, Host, Result};
use crate::{SuggestionRevisionAdmission, SuggestionRevisionRequest};
use serde_json::{Value, json};
pub(super) async fn publish(
    host: &Host,
    principal: String,
    state: ConnectionState,
    request: SuggestionRevisionRequest,
) -> Result<Value> {
    let admission = host
        .transaction(move |room| {
            state.validate(room, &principal)?;
            room.revise_document_suggestion(&principal, &request)
        })
        .await?;
    if matches!(&admission,SuggestionRevisionAdmission::Durable(value) if !value.duplicate) {
        host.notify_document_suggestions();
    }
    Ok(json!({"kind":"suggestionRevisionAdmission","admission":admission}))
}
