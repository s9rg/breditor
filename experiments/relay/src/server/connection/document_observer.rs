//! Permanently non-authoring document streams for negotiated review or suggestion readers.
//! The original review negotiation remains sufficient; suggestions are a separate explicit opt-in.
use super::{ConnectionState, Host, Request};
use crate::{Error, Result};
use serde_json::{Value, json};
pub(super) async fn dispatch(
    host: &Host,
    principal: &str,
    state: &mut ConnectionState,
    request: Request,
) -> Result<Value> {
    if !state.review_mode.enabled() && !state.suggestions {
        return Err(Error::Contract("read-only document stream capability required"));
    }
    let principal = principal.to_owned();
    let previous = state.lease.clone();
    let (lease, response) = match request {
        Request::RegisterObserver => {
            let registration = host
                .transaction(move |room| {
                    let registration = room.register_observer(&principal)?;
                    if let Some(old) = previous {
                        room.release(&old);
                    }
                    Ok(registration)
                })
                .await?;
            (
                registration.lease.clone(),
                json!({"kind":"observerRegistered","registration":registration}),
            )
        }
        Request::ResumeObserver { writer, credential } => {
            let lease = host
                .transaction(move |room| {
                    let lease = room.resume_observer(&principal, &writer, &credential)?;
                    if let Some(old) = previous {
                        room.release(&old);
                    }
                    Ok(lease)
                })
                .await?;
            (lease.clone(), json!({"kind":"observerResumed","lease":lease}))
        }
        _ => return Err(Error::Contract("not a document observer request")),
    };
    state.lease = Some(lease);
    state.observer = true;
    Ok(response)
}
