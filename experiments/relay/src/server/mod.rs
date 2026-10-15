//! Loopback reference WebSocket host. All native transactions and blocking fsync run off the
//! async I/O workers, inside the same serialized room authority. Public untrusted hosting still
//! requires the planned resource-limited import worker, TLS and deployment qualification.
mod assets;
mod authentication;
mod connection;
mod wire;
use crate::{Error, Result, Room};
pub use authentication::Authentication;
use axum::{
    Router,
    extract::{State, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use std::sync::{Arc, Mutex};
use tokio::sync::{Semaphore, watch};

#[derive(Clone)]
pub(super) struct Host {
    room: Arc<Mutex<Room>>,
    authentication: Arc<Authentication>,
    changed: watch::Sender<u64>,
    connections: Arc<Semaphore>,
    assets: Option<Arc<Mutex<crate::assets::AssetStore>>>,
    assets_changed: watch::Sender<u64>,
    asset_operations: Arc<Semaphore>,
    presence_changed: watch::Sender<u64>,
}
impl Host {
    pub async fn transaction<T: Send + 'static>(
        &self,
        f: impl FnOnce(&mut Room) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let room = self.room.clone();
        tokio::task::spawn_blocking(move || {
            let mut room = room.lock().map_err(|_| Error::NeedsRecovery)?;
            f(&mut room)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
    pub fn notify(&self) {
        self.changed.send_modify(|n| *n = n.wrapping_add(1));
        self.notify_presence();
    }
    pub fn notify_presence(&self) {
        self.presence_changed.send_modify(|n| *n = n.wrapping_add(1));
    }
}

/// Build an authenticated, exact-Origin, bounded reference room router.
/// `/health` reveals only the live service version; `/ws` requires a first-message account handshake.
/// The server holds at most 64 live upgrades and coalesces catchup notifications without keeping
/// an unbounded per-peer frame queue. A newly authorized reader receives the latest full state.
pub fn router(room: Room, authentication: Authentication) -> Router {
    build(room, authentication, None)
}
/// Attach an explicitly opened durable asset store to the room. HTTP reads/writes authenticate
/// the same accounts and recheck current room roles; a digest URL never grants access by itself.
/// # Errors
/// Rejects a store bound to another immutable room seed/authority.
pub fn router_with_assets(
    room: Room,
    authentication: Authentication,
    assets: crate::assets::AssetStore,
) -> Result<Router> {
    if room.asset_binding() != assets.binding() {
        return Err(Error::Contract("asset store room binding"));
    }
    Ok(build(room, authentication, Some(assets)))
}
fn build(
    room: Room,
    authentication: Authentication,
    assets: Option<crate::assets::AssetStore>,
) -> Router {
    let (changed, _) = watch::channel(0);
    let (assets_changed, _) = watch::channel(0);
    let (presence_changed, _) = watch::channel(0);
    let host = Host {
        room: Arc::new(Mutex::new(room)),
        authentication: Arc::new(authentication),
        changed,
        connections: Arc::new(Semaphore::new(64)),
        assets: assets.map(|store| Arc::new(Mutex::new(store))),
        assets_changed,
        asset_operations: Arc::new(Semaphore::new(4)),
        presence_changed,
    };
    Router::new()
        .route("/health", get(|| async { "breditor-relay-v1" }))
        .route("/ws", get(upgrade))
        .route(
            "/assets/{asset}",
            get(assets::download).put(assets::upload).options(assets::preflight),
        )
        .with_state(host)
}
async fn upgrade(State(host): State<Host>, headers: HeaderMap, ws: WebSocketUpgrade) -> Response {
    if !headers
        .get("origin")
        .and_then(|h| h.to_str().ok())
        .is_some_and(|o| host.authentication.origin(o))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Ok(permit) = host.connections.clone().try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    ws.max_message_size(wire::MAX_MESSAGE)
        .max_frame_size(wire::MAX_MESSAGE)
        .write_buffer_size(64 * 1024)
        .max_write_buffer_size(wire::MAX_MESSAGE + 64 * 1024)
        .on_upgrade(move |socket| connection::run(host, socket, permit))
}
