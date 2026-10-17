//! Explicit negotiated review requests; all authority is authenticated connection/Room state.
use super::{ConnectionState, Host, Request};
use crate::{Error, Result, ReviewAdmission};
use serde_json::{Value, json};
mod reads;

pub(super) async fn dispatch(
    host: &Host,
    principal: &str,
    state: &mut ConnectionState,
    request: Request,
) -> Result<Value> {
    if !state.review_enabled {
        return Err(Error::Contract("review V1 capability required"));
    }
    let principal = principal.to_owned();
    match request {
        Request::RegisterObserver => {
            let previous = state.lease.clone();
            let registration = host
                .transaction(move |room| {
                    let registration = room.register_observer(&principal)?;
                    if let Some(old) = previous {
                        room.release(&old);
                    }
                    Ok(registration)
                })
                .await?;
            state.lease = Some(registration.lease.clone());
            state.observer = true;
            Ok(json!({"kind":"observerRegistered","registration":registration}))
        }
        Request::ResumeObserver { writer, credential } => {
            let previous = state.lease.clone();
            let lease = host
                .transaction(move |room| {
                    let lease = room.resume_observer(&principal, &writer, &credential)?;
                    if let Some(old) = previous {
                        room.release(&old);
                    }
                    Ok(lease)
                })
                .await?;
            state.lease = Some(lease.clone());
            state.observer = true;
            Ok(json!({"kind":"observerResumed","lease":lease}))
        }
        Request::ReviewRegister { actor } => {
            let previous = state.review_lease.clone();
            let registration = host
                .transaction(move |room| {
                    let registration = room.register_review(&principal, actor)?;
                    if let Some(old) = previous {
                        room.release_review(&old);
                    }
                    Ok(registration)
                })
                .await?;
            state.review_lease = Some(registration.lease.clone());
            Ok(json!({"kind":"reviewRegistered","registration":registration}))
        }
        Request::ReviewResume { actor, credential } => {
            let previous = state.review_lease.clone();
            let lease = host
                .transaction(move |room| {
                    let lease = room.resume_review(&principal, &actor, &credential)?;
                    if let Some(old) = previous {
                        room.release_review(&old);
                    }
                    Ok(lease)
                })
                .await?;
            state.review_lease = Some(lease.clone());
            Ok(json!({"kind":"reviewResumed","lease":lease}))
        }
        Request::ReviewSubmit { frame } => {
            let lease = state.review_lease.clone().ok_or(Error::Lease)?;
            let outcome =
                host.transaction(move |room| room.admit_review(&principal, &lease, &frame)).await?;
            if matches!(&outcome,ReviewAdmission::Durable(ack) if !ack.duplicate) {
                host.notify_review();
            }
            Ok(json!({"kind":"reviewAdmission","admission":outcome}))
        }
        Request::ReviewSync { cursor } => {
            reads::catchup(host, principal, state.clone(), cursor).await
        }
        Request::ReviewClock { actor } => reads::clock(host, principal, state.clone(), actor).await,
        Request::ReviewCursorProof { cursor } => {
            reads::cursor_proof(host, principal, state.clone(), cursor).await
        }
        Request::ReviewGrant { principal: target, role } => {
            grant(host, principal, target, role).await
        }
        _ => Err(Error::Contract("not a review request")),
    }
}
async fn grant(
    host: &Host,
    principal: String,
    target: String,
    role: Option<crate::ReviewRole>,
) -> Result<Value> {
    host.transaction(move |room| room.grant_review(&principal, &target, role)).await?;
    host.notify_review();
    Ok(json!({"kind":"reviewGranted"}))
}
