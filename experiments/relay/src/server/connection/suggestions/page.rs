//! Read a frozen bounded immutable interval, with current live permissions separate from events.
use super::{ConnectionState, Host, Result, bound};
use crate::DocumentSuggestionsCursor;
use serde_json::{Value, json};
pub(super) async fn page(
    host: &Host,
    principal: String,
    state: ConnectionState,
    binding: String,
    cursor: Option<DocumentSuggestionsCursor>,
) -> Result<Value> {
    host.transaction(move |room| {
        state.validate(room, &principal)?;
        bound(room, &principal, &binding)?;
        Ok(json!({"kind":"suggestionsPage","page":room.document_suggestions_page(&principal,cursor.as_ref())?}))
    })
    .await
}
