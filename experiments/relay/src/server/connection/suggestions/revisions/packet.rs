//! First exact native relation bytes; no packet reconstruction or current-authority inference.
use super::{ConnectionState, Host, Result, bound};
use serde_json::{Value, json};
pub(super) async fn packet(
    host: &Host,
    principal: String,
    state: ConnectionState,
    binding: String,
    id: String,
) -> Result<Value> {
    let packet = host
        .transaction(move |room| {
            state.validate(room, &principal)?;
            bound(room, &principal, &binding)?;
            room.document_suggestion_revision_packet(&principal, &id)
        })
        .await?;
    Ok(json!({"kind":"suggestionRevisionPacket","packet":packet}))
}
