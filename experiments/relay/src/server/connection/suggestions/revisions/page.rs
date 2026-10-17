//! Frozen bounded metadata discovery under current reader rights and the negotiated binding.
use super::{ConnectionState, Host, Result, bound};
use crate::SuggestionRevisionsCursor;
use serde_json::{Value, json};
pub(super) async fn page(
    host: &Host,
    principal: String,
    state: ConnectionState,
    binding: String,
    cursor: Option<SuggestionRevisionsCursor>,
) -> Result<Value> {
    let page = host
        .transaction(move |room| {
            state.validate(room, &principal)?;
            bound(room, &principal, &binding)?;
            room.document_suggestion_revisions_page(&principal, cursor.as_ref())
        })
        .await?;
    Ok(json!({"kind":"suggestionRevisionsPage","page":page}))
}
