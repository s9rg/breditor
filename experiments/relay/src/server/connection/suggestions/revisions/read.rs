//! Exact immutable committed receipt read; knowing its digest grants no read permission.
use super::{ConnectionState, Host, Result, bound};
use serde_json::{Value, json};
pub(super) async fn read(
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
            room.document_suggestion_revision(&principal, &id)
        })
        .await?;
    Ok(json!({"kind":"suggestionRevision","revision":revision}))
}
