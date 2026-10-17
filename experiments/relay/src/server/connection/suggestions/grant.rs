//! Only the freshly authenticated room owner can durably grant or revoke suggestion rights.
use super::{ConnectionState, Host, Result};
use crate::SuggestionRole;
use serde_json::{Value, json};
pub(super) async fn grant(
    host: &Host,
    principal: String,
    state: ConnectionState,
    target: String,
    role: Option<SuggestionRole>,
) -> Result<Value> {
    host.transaction(move |room| {
        state.validate(room, &principal)?;
        room.grant_document_suggestions(&principal, &target, role)
    })
    .await?;
    host.notify_document_suggestions();
    Ok(json!({"kind":"suggestionGranted"}))
}
