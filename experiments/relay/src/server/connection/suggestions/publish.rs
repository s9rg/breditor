//! Publish an immutable native intent under the socket's authenticated principal, not a packet claim.
use super::{ConnectionState, Host, Result, bound};
use crate::DocumentSuggestionAdmission;
use serde_json::{Value, json};
pub(super) async fn publish(
    host: &Host,
    principal: String,
    state: ConnectionState,
    binding: String,
    packet: String,
) -> Result<Value> {
    let admission = host
        .transaction(move |room| {
            state.validate(room, &principal)?;
            bound(room, &principal, &binding)?;
            room.publish_document_suggestion(&principal, &packet)
        })
        .await?;
    if matches!(&admission, DocumentSuggestionAdmission::Durable(receipt) if !receipt.duplicate) {
        host.notify_document_suggestions();
    }
    Ok(json!({"kind":"suggestionAdmission","admission":admission}))
}
