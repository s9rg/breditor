//! Explicit current grants and lineage reads; original reviewV1 response shapes stay closed.
use super::{ConnectionState, Host};
use crate::{Error, Result, ReviewCursor};
use breditor_collab_feasibility::review::ReviewActorId;
use serde_json::{Value, json};
pub(super) async fn catchup(
    host: &Host,
    principal: String,
    current: ConnectionState,
    cursor: Option<ReviewCursor>,
) -> Result<Value> {
    host.transaction(move |room| {
        current.validate(room, &principal)?;
        let mut page = serde_json::to_value(room.review_catchup(&principal, cursor.as_ref())?)?;
        if !current.review_mode.lineage() {
            page.as_object_mut().ok_or(Error::Contract("review page"))?.remove("currentRole");
        }
        Ok(json!({"kind":"reviewCatchup","page":page}))
    })
    .await
}
pub(super) async fn clock(
    host: &Host,
    principal: String,
    current: ConnectionState,
    actor: ReviewActorId,
) -> Result<Value> {
    host.transaction(move |room| {
        current.validate(room, &principal)?;
        Ok(json!({"kind":"reviewClock","clock":room.review_writer_clock(&principal,&actor)?}))
    })
    .await
}
pub(super) async fn cursor_proof(
    host: &Host,
    principal: String,
    current: ConnectionState,
    cursor: ReviewCursor,
) -> Result<Value> {
    if !current.review_mode.lineage() {
        return Err(Error::Contract("review lineage capability required"));
    }
    host.transaction(move|room|{
        current.validate(room,&principal)?;
        Ok(json!({"kind":"reviewCursorProof","proof":room.review_cursor_proof(&principal,&cursor)?}))
    }).await
}
