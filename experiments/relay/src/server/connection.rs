//! Account-authenticated socket lifecycle and native transaction dispatch.
use super::{
    Host,
    wire::{self, Envelope, Request},
};
use crate::{Admission, Error, Lease, Result};
use axum::extract::ws::{Message, WebSocket};
use serde_json::{Value, json};
use std::time::Duration;
use tokio::sync::OwnedSemaphorePermit;

async fn send(socket: &mut WebSocket, id: Option<&str>, value: Value) -> bool {
    let message = Message::Text(wire::reply(id, &value).into());
    // Do not retain the original large snapshot tree across socket backpressure.
    drop(value);
    matches!(tokio::time::timeout(Duration::from_secs(10), socket.send(message)).await, Ok(Ok(())))
}
async fn snapshot(host: &Host, principal: &str, lease: Option<&Lease>) -> Result<Value> {
    let principal = principal.to_owned();
    let lease = lease.cloned();
    host.transaction(move |room| {
        if let Some(lease) = lease {
            room.validate_lease(&principal, &lease)?;
        }
        Ok(json!({"kind":"catchup","frame":room.catchup(&principal)?}))
    })
    .await
}
async fn dispatch(
    host: &Host,
    principal: &str,
    lease: &mut Option<Lease>,
    request: Request,
    presence_enabled: bool,
) -> Result<Value> {
    let principal = principal.to_owned();
    match request {
        Request::Authenticate { .. } => Err(Error::Contract("already authenticated")),
        Request::Sync => snapshot(host, &principal, lease.as_ref()).await,
        Request::Presence { sequence, frame } => {
            if !presence_enabled {
                return Err(Error::Contract("presence capability required"));
            }
            let current = lease.clone().ok_or(Error::Lease)?;
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
        Request::Clock { writer } => {
            let lease = lease.clone();
            host.transaction(move |room| {
                if let Some(lease) = lease {
                    room.validate_lease(&principal, &lease)?;
                }
                Ok(json!({"kind":"clock","clock":room.writer_clock(&principal, &writer)?}))
            })
            .await
        }
        Request::Grant { principal: target, role } => {
            host.transaction(move |room| room.grant(&principal, &target, role)).await?;
            host.notify();
            Ok(json!({"kind":"granted"}))
        }
        Request::Register => {
            let previous = lease.clone();
            let r = host
                .transaction(move |room| {
                    let r = room.register(&principal)?;
                    if let Some(old) = previous {
                        room.release(&old);
                    }
                    Ok(r)
                })
                .await?;
            *lease = Some(r.lease.clone());
            host.notify();
            Ok(json!({"kind":"registered","registration":r}))
        }
        Request::Resume { writer, credential } => {
            let previous = lease.clone();
            let next = host
                .transaction(move |room| {
                    let r = room.resume(&principal, &writer, &credential)?;
                    if let Some(old) = previous {
                        room.release(&old);
                    }
                    Ok(r)
                })
                .await?;
            *lease = Some(next.clone());
            host.notify();
            Ok(json!({"kind":"resumed","lease":next}))
        }
        Request::Submit { group } => {
            let current = lease.clone().ok_or(Error::Lease)?;
            let outcome =
                host.transaction(move |room| room.admit(&principal, &current, &group)).await?;
            if matches!(&outcome, Admission::Durable(ack) if !ack.duplicate) {
                host.notify();
            }
            Ok(serde_json::to_value(outcome)?)
        }
    }
}

async fn handshake(host: &Host, socket: &mut WebSocket) -> Option<(String, bool, bool)> {
    let Ok(Some(Ok(Message::Text(input)))) =
        tokio::time::timeout(Duration::from_secs(5), socket.recv()).await
    else {
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
    if capabilities.len() > 2
        || capabilities.iter().any(|c| c != "assets" && c != "presence")
        || capabilities.iter().collect::<std::collections::BTreeSet<_>>().len()
            != capabilities.len()
    {
        return None;
    }
    let assets_enabled = host.assets.is_some() && capabilities.iter().any(|c| c == "assets");
    let presence_enabled = capabilities.iter().any(|c| c == "presence");
    let supported =
        capabilities.into_iter().filter(|c| c != "assets" || assets_enabled).collect::<Vec<_>>();
    let authentication = host.authentication.authenticate(&principal, &token);
    let accepted = match authentication {
        Ok(()) => {
            let p = principal.clone();
            host.transaction(move |room| Ok(json!({"kind":"authenticated","frame":room.catchup(&p)?,"descriptor":room.descriptor(&p)?,"capabilities":supported}))).await
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
    Some((principal, assets_enabled, presence_enabled))
}
pub(super) async fn run(host: Host, mut socket: WebSocket, _permit: OwnedSemaphorePermit) {
    let mut changed = host.changed.subscribe();
    let mut assets_changed = host.assets_changed.subscribe();
    let mut presence_changed = host.presence_changed.subscribe();
    let mut heartbeat = tokio::time::interval(Duration::from_secs(5));
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let Some((principal, assets_enabled, presence_enabled)) = handshake(&host, &mut socket).await
    else {
        return;
    };
    let mut lease = None;
    loop {
        tokio::select! {
            message = socket.recv() => {
                match message {
                    Some(Ok(Message::Text(input))) => {
                        let envelope = match Envelope::decode(&input) {
                            Ok(e) => e,
                            Err(error) => { if !send(&mut socket, None, wire::error(&error)).await { break; } continue; }
                        };
                        let result = dispatch(&host, &principal, &mut lease, envelope.request, presence_enabled).await;
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
                match snapshot(&host, &principal, lease.as_ref()).await {
                    Ok(value) => if !send(&mut socket, None, value).await { break; },
                    Err(error) => { send(&mut socket, None, wire::error(&error)).await; break; }
                }
            }
            update = assets_changed.changed(), if assets_enabled => {
                if update.is_err() { break; }
                assets_changed.borrow_and_update();
                let p = principal.clone();
                let l = lease.clone();
                let permitted = host.transaction(move |room| {
                    room.reader(&p)?;
                    if let Some(lease) = l { room.validate_lease(&p,&lease)?; }
                    Ok(())
                }).await;
                match permitted {
                    Ok(()) => if !send(&mut socket,None,json!({"kind":"assetsChanged"})).await { break; },
                    Err(e) => { send(&mut socket,None,wire::error(&e)).await; break; }
                }
            }
            update=presence_changed.changed(), if presence_enabled => {
                if update.is_err() { break; }
                presence_changed.borrow_and_update();
                if !send_presence(&host,&principal,lease.as_ref(),&mut socket).await { break; }
            }
            _=heartbeat.tick(), if presence_enabled => {
                if !send_presence(&host,&principal,lease.as_ref(),&mut socket).await { break; }
            }
        }
    }
    if let Some(lease) = lease {
        let _ = host
            .transaction(move |room| {
                room.release(&lease);
                Ok(())
            })
            .await;
        host.notify_presence();
    }
}
async fn send_presence(
    host: &Host,
    principal: &str,
    lease: Option<&Lease>,
    socket: &mut WebSocket,
) -> bool {
    let principal = principal.to_owned();
    let lease = lease.cloned();
    match host.transaction(move |room| room.presence_snapshot(&principal, lease.as_ref())).await {
        Ok(peers) => send(socket, None, json!({"kind":"presence","peers":peers})).await,
        Err(e) => {
            send(socket, None, wire::error(&e)).await;
            false
        }
    }
}
