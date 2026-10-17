//! Separately negotiated suggestion requests; neither payloads nor cached roles confer authority.
mod decide;
mod grant;
mod packet;
mod page;
mod publish;
mod read;
use super::{ConnectionState, Host, Request};
use crate::{Error, Result, Room};
use axum::extract::ws::WebSocket;
use serde_json::{Value, json};

fn bound(room: &Room, principal: &str, binding: &str) -> Result<()> {
    if room.document_suggestions_descriptor(principal)?.binding != binding {
        return Err(Error::Contract("suggestion transport lane binding"));
    }
    Ok(())
}
pub(super) async fn send_changed(
    host: &Host,
    principal: &str,
    state: &ConnectionState,
    socket: &mut WebSocket,
) -> bool {
    let principal = principal.to_owned();
    let state = state.clone();
    match host
        .transaction(move |room| {
            state.validate(room, &principal)?;
            room.suggestion_permissions(&principal)
        })
        .await
    {
        Ok(permissions) => {
            super::send(
                socket,
                None,
                json!({"kind":"documentSuggestionsChanged","permissions":permissions}),
            )
            .await
        }
        Err(error) => {
            super::send(socket, None, super::wire::error(&error)).await;
            false
        }
    }
}
pub(super) async fn dispatch(
    host: &Host,
    principal: &str,
    state: &ConnectionState,
    request: Request,
) -> Result<Value> {
    if !state.suggestions {
        return Err(Error::Contract("document suggestions V1 capability required"));
    }
    let principal = principal.to_owned();
    match request {
        Request::SuggestionPublish { binding, packet } => {
            publish::publish(host, principal, state.clone(), binding, packet).await
        }
        Request::SuggestionDecide { decision } => {
            decide::decide(host, principal, state.clone(), decision).await
        }
        Request::SuggestionSync { binding, cursor } => {
            page::page(host, principal, state.clone(), binding, cursor).await
        }
        Request::SuggestionRead { binding, suggestion_id } => {
            read::read(host, principal, state.clone(), binding, suggestion_id).await
        }
        Request::SuggestionPacket { binding, suggestion_id } => {
            packet::packet(host, principal, state.clone(), binding, suggestion_id).await
        }
        Request::SuggestionGrant { principal: target, role } => {
            grant::grant(host, principal, state.clone(), target, role).await
        }
        _ => Err(Error::Contract("not a suggestion request")),
    }
}
