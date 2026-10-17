//! Read current pending/final state; historical attribution never grants current authority.
use super::{ConnectionState, Host, Result, bound};
use serde_json::{Value, json};
pub(super) async fn read(
    host: &Host,
    principal: String,
    state: ConnectionState,
    binding: String,
    id: String,
) -> Result<Value> {
    host.transaction(move |room| {
        state.validate(room, &principal)?;
        bound(room, &principal, &binding)?;
        Ok(json!({"kind":"suggestionEntry","entry":room.document_suggestion(&principal,&id)?,"permissions":room.suggestion_permissions(&principal)?}))
    })
    .await
}
