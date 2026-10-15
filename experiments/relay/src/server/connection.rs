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
) -> Result<Value> {
    let principal = principal.to_owned();
    match request {
        Request::Authenticate { .. } => Err(Error::Contract("already authenticated")),
        Request::Sync => snapshot(host, &principal, lease.as_ref()).await,
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

pub(super) async fn run(host: Host, mut socket: WebSocket, _permit: OwnedSemaphorePermit) {
    let mut changed = host.changed.subscribe();
    let mut assets_changed = host.assets_changed.subscribe();
    let Ok(Some(Ok(Message::Text(input)))) =
        tokio::time::timeout(Duration::from_secs(5), socket.recv()).await
    else {
        return;
    };
    if input.len() > 2048 {
        return;
    }
    let Ok(envelope) = Envelope::decode(&input) else {
        return;
    };
    let Request::Authenticate { principal, token, capabilities } = envelope.request else {
        return;
    };
    if capabilities.len() > 1 || capabilities.iter().any(|c| c != "assets") {
        return;
    }
    let assets_enabled = host.assets.is_some() && capabilities.iter().any(|c| c == "assets");
    let authentication = host.authentication.authenticate(&principal, &token);
    let accepted = match authentication {
        Ok(()) => {
            let p = principal.clone();
            host.transaction(move |room| Ok(json!({"kind":"authenticated","frame":room.catchup(&p)?,"descriptor":room.descriptor(&p)?,"capabilities":if assets_enabled {vec!["assets"]} else {vec![]}}))).await
        }
        Err(e) => Err(e),
    };
    match accepted {
        Ok(value) => {
            if !send(&mut socket, Some(&envelope.id), value).await {
                return;
            }
        }
        Err(error) => {
            send(&mut socket, Some(&envelope.id), wire::error(&error)).await;
            return;
        }
    }
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
                        let result = dispatch(&host, &principal, &mut lease, envelope.request).await;
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
        }
    }
    if let Some(lease) = lease {
        let _ = host
            .transaction(move |room| {
                room.release(&lease);
                Ok(())
            })
            .await;
    }
}
