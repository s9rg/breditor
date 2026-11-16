//! Account-authenticated socket lifecycle and native transaction dispatch.
use super::{
    Host,
    wire::{self, Envelope, Request},
};
use crate::{Admission, Error, Lease, Result, ReviewLease, Room};
use axum::extract::ws::{Message, WebSocket};
use serde_json::{Value, json};
use std::time::Duration;
use tokio::sync::OwnedSemaphorePermit;
mod capabilities;
mod document_observer;
mod review;
mod suggestions;

#[derive(Clone, Copy, PartialEq, Eq)]
enum SuggestionMode {
    None,
    Original,
    Revisions,
}
impl SuggestionMode {
    fn from_capabilities(capabilities: &[String]) -> Self {
        if capabilities.iter().any(|c| c == "documentSuggestionRevisionsV1") {
            Self::Revisions
        } else if capabilities.iter().any(|c| c == "documentSuggestionsV1") {
            Self::Original
        } else {
            Self::None
        }
    }
    fn enabled(self) -> bool {
        self != Self::None
    }
    fn revisions(self) -> bool {
        self == Self::Revisions
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PresenceMode {
    None,
    Original,
    DocumentV1,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum ReviewMode {
    None,
    Original,
    Lineage,
    Observers,
}
impl ReviewMode {
    fn from_capabilities(capabilities: &[String]) -> Self {
        let has = |name| capabilities.iter().any(|c| c == name);
        if has("reviewObserverV1") {
            Self::Observers
        } else if has("reviewLineageV1") {
            Self::Lineage
        } else if has("reviewV1") {
            Self::Original
        } else {
            Self::None
        }
    }
    fn enabled(self) -> bool {
        self != Self::None
    }
    fn lineage(self) -> bool {
        matches!(self, Self::Lineage | Self::Observers)
    }
    fn observers(self) -> bool {
        self == Self::Observers
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum ReviewLeaseKind {
    Author,
    Observer,
}

#[derive(Clone)]
struct ConnectionState {
    lease: Option<Lease>,
    observer: bool,
    review_lease: Option<ReviewLease>,
    review_mode: ReviewMode,
    review_lease_kind: ReviewLeaseKind,
    presence: PresenceMode,
    versions: bool,
    suggestions: SuggestionMode,
}
impl ConnectionState {
    fn validate(&self, room: &Room, principal: &str) -> Result<()> {
        room.reader(principal)?;
        if let Some(lease) = &self.lease {
            if self.observer {
                room.validate_observer_lease(principal, lease)?;
            } else {
                room.validate_lease(principal, lease)?;
            }
        }
        if let Some(lease) = &self.review_lease {
            if self.review_lease_kind == ReviewLeaseKind::Observer {
                room.validate_review_observer_lease(principal, lease)?;
            } else {
                room.validate_review_lease(principal, lease)?;
            }
        }
        Ok(())
    }
}

async fn send(socket: &mut WebSocket, id: Option<&str>, value: Value) -> bool {
    let message = Message::Text(wire::reply(id, &value).into());
    // Do not retain the original large snapshot tree across socket backpressure.
    drop(value);
    matches!(tokio::time::timeout(Duration::from_secs(10), socket.send(message)).await, Ok(Ok(())))
}
async fn snapshot(host: &Host, principal: &str, state: &ConnectionState) -> Result<Value> {
    let principal = principal.to_owned();
    let state = state.clone();
    host.transaction(move |room| {
        state.validate(room, &principal)?;
        Ok(json!({"kind":"catchup","frame":room.catchup(&principal)?}))
    })
    .await
}
async fn dispatch(
    host: &Host,
    principal: &str,
    state: &mut ConnectionState,
    request: Request,
) -> Result<Value> {
    let principal = principal.to_owned();
    match request {
        Request::Authenticate { .. } => Err(Error::Contract("already authenticated")),
        Request::Sync => snapshot(host, &principal, state).await,
        request if suggestions::handles(&request) => {
            suggestions::dispatch(host, &principal, state, request).await
        }
        request @ (Request::RegisterObserver | Request::ResumeObserver { .. }) => {
            document_observer::dispatch(host, &principal, state, request).await
        }
        request @ (Request::ReviewRegister { .. }
        | Request::ReviewResume { .. }
        | Request::ReviewRegisterObserver { .. }
        | Request::ReviewResumeObserver { .. }
        | Request::ReviewSubmit { .. }
        | Request::ReviewSync { .. }
        | Request::ReviewClock { .. }
        | Request::ReviewCursorProof { .. }
        | Request::ReviewGrant { .. }) => review::dispatch(host, &principal, state, request).await,
        Request::Presence { sequence, frame } => {
            if state.presence != PresenceMode::Original || state.observer {
                return Err(Error::Contract("presence capability required"));
            }
            let current = state.lease.clone().ok_or(Error::Lease)?;
            let changed = host
                .transaction(move |room| {
                    room.publish_presence(&principal, &current, &sequence, &frame)
                })
                .await?;
            if changed {
                host.notify_presence();
            }
            Ok(json!({"kind":"presenceAccepted","changed":changed}))
        }
        Request::DocumentPresence { sequence, frame } => {
            if state.presence != PresenceMode::DocumentV1 || state.observer {
                return Err(Error::Contract("document presence capability required"));
            }
            let current = state.lease.clone().ok_or(Error::Lease)?;
            let changed = host
                .transaction(move |room| {
                    room.publish_document_presence(&principal, &current, &sequence, &frame)
                })
                .await?;
            if changed {
                host.notify_presence();
            }
            Ok(json!({"kind":"presenceAccepted","changed":changed}))
        }
        Request::Clock { writer } => {
            let state = state.clone();
            host.transaction(move |room| {
                state.validate(room, &principal)?;
                Ok(json!({"kind":"clock","clock":room.writer_clock(&principal, &writer)?}))
            })
            .await
        }
        Request::Grant { principal: target, role } => grant(host, principal, target, role).await,
        Request::Register => {
            let previous = state.lease.clone();
            let r = host
                .transaction(move |room| {
                    let r = room.register(&principal)?;
                    if let Some(old) = previous {
                        room.release(&old);
                    }
                    Ok(r)
                })
                .await?;
            state.lease = Some(r.lease.clone());
            state.observer = false;
            host.notify();
            Ok(json!({"kind":"registered","registration":r}))
        }
        Request::Resume { writer, credential } => {
            let previous = state.lease.clone();
            let next = host
                .transaction(move |room| {
                    let r = room.resume(&principal, &writer, &credential)?;
                    if let Some(old) = previous {
                        room.release(&old);
                    }
                    Ok(r)
                })
                .await?;
            state.lease = Some(next.clone());
            state.observer = false;
            host.notify();
            Ok(json!({"kind":"resumed","lease":next}))
        }
        Request::Submit { group } => submit(host, principal, state, group).await,
        _ => Err(Error::Contract("unsupported request")),
    }
}
async fn submit(
    host: &Host,
    principal: String,
    state: &ConnectionState,
    group: String,
) -> Result<Value> {
    if state.observer {
        return Err(Error::Lease);
    }
    let current = state.lease.clone().ok_or(Error::Lease)?;
    let outcome = host.transaction(move |room| room.admit(&principal, &current, &group)).await?;
    if matches!(&outcome,Admission::Durable(ack) if !ack.duplicate) {
        host.notify();
    }
    Ok(serde_json::to_value(outcome)?)
}

async fn grant(
    host: &Host,
    principal: String,
    target: String,
    role: Option<crate::Role>,
) -> Result<Value> {
    host.transaction(move |room| room.grant(&principal, &target, role)).await?;
    host.notify();
    host.notify_document_suggestions();
    Ok(json!({"kind":"granted"}))
}

async fn handshake(host: &Host, socket: &mut WebSocket) -> Option<(String, bool, ConnectionState)> {
    let incoming = tokio::select! {
        () = super::publication_connections::stopped(host.publication_connections.as_deref()) => return None,
        incoming = tokio::time::timeout(Duration::from_secs(5), socket.recv()) => incoming,
    };
    let Ok(Some(Ok(Message::Text(input)))) = incoming else {
        return None;
    };
    if input.len() > 2048 {
        return None;
    }
    let Ok(envelope) = Envelope::decode(&input) else {
        return None;
    };
    let Request::Authenticate { principal, token, capabilities } = envelope.request else {
        return None;
    };
    if !capabilities::valid(&capabilities) {
        return None;
    }
    let assets_enabled = host.serves_assets() && capabilities.iter().any(|c| c == "assets");
    let review_mode = ReviewMode::from_capabilities(&capabilities);
    let review_enabled = review_mode.enabled();
    let versions = capabilities.iter().any(|c| c == "documentVersionsV1");
    let suggestions = SuggestionMode::from_capabilities(&capabilities);
    let review_lineage = review_mode.lineage();
    let presence = if capabilities.iter().any(|c| c == "documentPresenceV1") {
        PresenceMode::DocumentV1
    } else if capabilities.iter().any(|c| c == "presence") {
        PresenceMode::Original
    } else {
        PresenceMode::None
    };
    let supported =
        capabilities.into_iter().filter(|c| c != "assets" || assets_enabled).collect::<Vec<_>>();
    let authentication = host.authentication.authenticate(&principal, &token);
    let accepted = match authentication {
        Ok(()) => {
            let p = principal.clone();
            host.transaction(move |room| {
                let frame=room.catchup(&p)?;
                if supported.iter().any(|c|c=="writerTransportV2") != (room.writer_transport_version()==2) {return Err(Error::Contract("explicit writer transport negotiation required"));}
                if presence==PresenceMode::DocumentV1&&room.writer_transport_version()!=2 {return Err(Error::Contract("document presence requires transport V2"));}
                let mut response=json!({"kind":"authenticated","frame":frame,"descriptor":room.descriptor(&p)?,"capabilities":supported});
                if review_enabled { response["reviewDescriptor"]=serde_json::to_value(room.review_descriptor(&p)?)?; }
                if review_lineage {response["reviewRole"]=serde_json::to_value(room.review_permissions(&p)?)?;}
                if versions {response["documentVersionsDescriptor"]=serde_json::to_value(room.document_versions_descriptor(&p)?)?;response["documentVersionsCanPublish"]=serde_json::to_value(room.document_versions_can_publish(&p)?)?;}
                if suggestions.enabled() {response["documentSuggestionsDescriptor"]=serde_json::to_value(room.document_suggestions_descriptor(&p)?)?;response["documentSuggestionsPermissions"]=serde_json::to_value(room.suggestion_permissions(&p)?)?;}
                if suggestions.revisions() {response["documentSuggestionRevisionsDescriptor"]=serde_json::to_value(room.document_suggestion_revisions_descriptor(&p)?)?;}
                Ok(response)
            }).await
        }
        Err(e) => Err(e),
    };
    match accepted {
        Ok(value) => {
            if !send(socket, Some(&envelope.id), value).await {
                return None;
            }
        }
        Err(error) => {
            send(socket, Some(&envelope.id), wire::error(&error)).await;
            return None;
        }
    }
    Some((
        principal,
        assets_enabled,
        ConnectionState {
            lease: None,
            observer: false,
            review_lease: None,
            review_mode,
            review_lease_kind: ReviewLeaseKind::Author,
            presence,
            versions,
            suggestions,
        },
    ))
}
pub(super) async fn run(
    host: Host,
    mut socket: WebSocket,
    _permit: OwnedSemaphorePermit,
) -> Result<()> {
    let mut changed = host.changed.subscribe();
    let mut assets_changed = host.assets_changed.subscribe();
    let mut presence_changed = host.presence_changed.subscribe();
    let mut review_changed = host.review_changed.subscribe();
    let mut versions_changed = host.versions_changed.subscribe();
    let mut suggestions_changed = host.suggestions_changed.subscribe();
    let mut heartbeat = tokio::time::interval(Duration::from_secs(5));
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let Some((principal, assets_enabled, mut state)) = handshake(&host, &mut socket).await else {
        return Ok(());
    };
    loop {
        if host.publication_connections.as_ref().is_some_and(|owner| owner.is_stopped()) {
            break;
        }
        tokio::select! {
            () = super::publication_connections::stopped(host.publication_connections.as_deref()) => break,
            message = socket.recv() => {
                match message {
                    Some(Ok(Message::Text(input))) => {
                        let envelope = match Envelope::decode(&input) {
                            Ok(e) => e,
                            Err(error) => { if !send(&mut socket, None, wire::error(&error)).await { break; } continue; }
                        };
                        let result = dispatch(&host, &principal, &mut state, envelope.request).await;
                        let failed_storage = matches!(result, Err(Error::NeedsRecovery | Error::Io(_)));
                        let value = result.unwrap_or_else(|e| wire::error(&e));
                        if !send(&mut socket, Some(&envelope.id), value).await || failed_storage { break; }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if !matches!(tokio::time::timeout(Duration::from_secs(10), socket.send(Message::Pong(payload))).await, Ok(Ok(()))) { break; }
                    }
                    Some(Ok(Message::Pong(_))) => {},
                    _ => break,
                }
            }
            update = changed.changed() => {
                if update.is_err() { break; }
                changed.borrow_and_update();
                match snapshot(&host, &principal, &state).await {
                    Ok(value) => if !send(&mut socket, None, value).await { break; },
                    Err(error) => { send(&mut socket, None, wire::error(&error)).await; break; }
                }
            }
            update = assets_changed.changed(), if assets_enabled => {
                if update.is_err() { break; }
                assets_changed.borrow_and_update();
                let p = principal.clone();
                let s = state.clone();
                let permitted = host.transaction(move |room| {
                    s.validate(room,&p)?;
                    Ok(())
                }).await;
                match permitted {
                    Ok(()) => if !send(&mut socket,None,json!({"kind":"assetsChanged"})).await { break; },
                    Err(e) => { send(&mut socket,None,wire::error(&e)).await; break; }
                }
            }
            update=presence_changed.changed(), if state.presence!=PresenceMode::None => {
                if update.is_err() { break; }
                presence_changed.borrow_and_update();
                if !send_presence(&host,&principal,&state,&mut socket).await { break; }
            }
            _=heartbeat.tick(), if state.presence!=PresenceMode::None => {
                if !send_presence(&host,&principal,&state,&mut socket).await { break; }
            }
            update=review_changed.changed(), if state.review_mode.enabled() => {
                if update.is_err() { break; }
                review_changed.borrow_and_update();
                let p=principal.clone();
                let s=state.clone();
                let permitted=host.transaction(move |room| s.validate(room,&p)).await;
                match permitted {
                    Ok(()) => if !send(&mut socket,None,json!({"kind":"reviewChanged"})).await {break;},
                    Err(e) => {send(&mut socket,None,wire::error(&e)).await;break;}
                }
            }
            update=versions_changed.changed(), if state.versions => {
                if update.is_err(){break;}
                versions_changed.borrow_and_update();
                if !send_versions_changed(&host,&principal,&state,&mut socket).await {break;}
            }
            update=suggestions_changed.changed(), if state.suggestions.enabled() => {
                if update.is_err(){break;}
                suggestions_changed.borrow_and_update();
                if !suggestions::send_changed(&host,&principal,&state,&mut socket).await {break;}
            }
        }
    }
    release_connection(&host, state).await
}
async fn release_connection(host: &Host, state: ConnectionState) -> Result<()> {
    if state.lease.is_some() || state.review_lease.is_some() {
        let cleanup = host
            .transaction(move |room| {
                if let Some(lease) = state.lease {
                    room.release(&lease);
                }
                if let Some(lease) = state.review_lease {
                    room.release_review(&lease);
                }
                Ok(())
            })
            .await;
        host.notify_presence();
        cleanup?;
    }
    Ok(())
}
async fn send_versions_changed(
    host: &Host,
    principal: &str,
    state: &ConnectionState,
    socket: &mut WebSocket,
) -> bool {
    let principal = principal.to_owned();
    let state = state.clone();
    match host.transaction(move |room| state.validate(room, &principal)).await {
        Ok(()) => send(socket, None, json!({"kind":"documentVersionsChanged"})).await,
        Err(error) => {
            send(socket, None, wire::error(&error)).await;
            false
        }
    }
}
async fn send_presence(
    host: &Host,
    principal: &str,
    state: &ConnectionState,
    socket: &mut WebSocket,
) -> bool {
    let principal = principal.to_owned();
    let state = state.clone();
    let presence = state.presence;
    match host.transaction(move |room| {
        state.validate(room,&principal)?;
        let lease=if state.observer {None}else{state.lease.as_ref()};
        if presence==PresenceMode::DocumentV1 {room.document_presence_snapshot(&principal,lease)}else{room.presence_snapshot(&principal, lease)}
    }).await {
        Ok(peers) => send(socket, None, json!({"kind":if presence==PresenceMode::DocumentV1{"documentPresence"}else{"presence"},"peers":peers})).await,
        Err(e) => {
            send(socket, None, wire::error(&e)).await;
            false
        }
    }
}
