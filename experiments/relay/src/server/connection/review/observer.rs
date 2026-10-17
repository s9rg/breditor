//! Explicit non-authoring metadata connections; payload flags never grant or promote author rights.
use super::{ConnectionState, Host, ReviewLeaseKind};
use crate::{Error, Result};
use breditor_collab_feasibility::review::ReviewActorId;
use serde_json::{Value, json};
pub(super) async fn register(
    host: &Host,
    principal: String,
    state: &mut ConnectionState,
    actor: ReviewActorId,
) -> Result<Value> {
    if !state.review_mode.observers() {
        return Err(Error::Contract("review observer capability required"));
    }
    let previous = state.review_lease.clone();
    let registration = host
        .transaction(move |room| {
            let registered = room.register_review_observer(&principal, actor)?;
            if let Some(old) = previous {
                room.release_review(&old);
            }
            Ok(registered)
        })
        .await?;
    state.review_lease = Some(registration.lease.clone());
    state.review_lease_kind = ReviewLeaseKind::Observer;
    Ok(json!({"kind":"reviewObserverRegistered","registration":registration}))
}
pub(super) async fn resume(
    host: &Host,
    principal: String,
    state: &mut ConnectionState,
    actor: ReviewActorId,
    credential: String,
) -> Result<Value> {
    if !state.review_mode.observers() {
        return Err(Error::Contract("review observer capability required"));
    }
    let previous = state.review_lease.clone();
    let lease = host
        .transaction(move |room| {
            let lease = room.resume_review_observer(&principal, &actor, &credential)?;
            if let Some(old) = previous {
                room.release_review(&old);
            }
            Ok(lease)
        })
        .await?;
    state.review_lease = Some(lease.clone());
    state.review_lease_kind = ReviewLeaseKind::Observer;
    host.notify_review();
    Ok(json!({"kind":"reviewObserverResumed","lease":lease}))
}
