//! Original winning successor lookup, not an optimistic latest-head guess or a mutation.
use super::{ConnectionState, Host, Result, bound};
use serde_json::{Value, json};
pub(super) async fn successor(
    host: &Host,
    principal: String,
    state: ConnectionState,
    binding: String,
    id: String,
) -> Result<Value> {
    let revision = host
        .transaction(move |room| {
            state.validate(room, &principal)?;
            bound(room, &principal, &binding)?;
            room.document_suggestion_successor(&principal, &id)
        })
        .await?;
    Ok(json!({"kind":"suggestionRevision","revision":revision}))
}
