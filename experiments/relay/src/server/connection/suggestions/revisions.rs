//! A separate capability on the existing suggestion socket; never another author lease.
mod packet;
mod page;
mod publish;
mod read;
mod successor;
use super::{ConnectionState, Error, Host, Request, Result, Room};
use serde_json::Value;
fn bound(room: &Room, principal: &str, binding: &str) -> Result<()> {
    if room.document_suggestion_revisions_descriptor(principal)?.binding != binding {
        return Err(Error::Contract("revision transport lane binding"));
    }
    Ok(())
}
pub(super) async fn dispatch(
    host: &Host,
    principal: String,
    state: ConnectionState,
    request: Request,
) -> Result<Value> {
    if !state.suggestions.revisions() {
        return Err(Error::Contract("document suggestion revisions V1 capability required"));
    }
    match request {
        Request::SuggestionRevisionPublish { revision } => {
            publish::publish(host, principal, state, revision).await
        }
        Request::SuggestionRevisionSync { binding, cursor } => {
            page::page(host, principal, state, binding, cursor).await
        }
        Request::SuggestionRevisionRead { binding, revision_id } => {
            read::read(host, principal, state, binding, revision_id).await
        }
        Request::SuggestionRevisionPacket { binding, revision_id } => {
            packet::packet(host, principal, state, binding, revision_id).await
        }
        Request::SuggestionRevisionSuccessor { binding, suggestion_id } => {
            successor::successor(host, principal, state, binding, suggestion_id).await
        }
        _ => Err(Error::Contract("not a revision request")),
    }
}
