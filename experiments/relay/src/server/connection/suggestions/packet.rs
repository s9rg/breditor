//! Download first immutable native packet bytes; a digest or saved binding is never a read grant.
use super::{ConnectionState, Host, Result, bound};
use serde_json::{Value, json};
pub(super) async fn packet(
    host: &Host,
    principal: String,
    state: ConnectionState,
    binding: String,
    id: String,
) -> Result<Value> {
    host.transaction(move |room| {
        state.validate(room, &principal)?;
        bound(room, &principal, &binding)?;
        Ok(json!({"kind":"suggestionPacket","packet":room.document_suggestion_packet(&principal,&id)?}))
    })
    .await
}
