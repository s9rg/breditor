//! Opt-in multi-room document server: authenticated REST reads, room creation/archival, bounded
//! server-side content injection through native shared commands, and signed webhooks.
//!
//! Nothing here is reachable from the existing single-room routers. A host must explicitly build a
//! [`DocumentServer`] from a `breditor/relay-document-api` V1 configuration; every capability in
//! that file defaults to off. Each room keeps its original [`Host`] authority, serialized room
//! transactions, writer leases, WebSocket protocol and asset store.
// Handlers short-circuit with an already-rendered HTTP response; boxing it buys nothing here.
#![allow(clippy::result_large_err)]
mod config;
mod injection;
mod watch;
mod webhooks;

use super::{Authentication, Host, create_shared_host, http};
use crate::{Error, Result, Role, Room, assets::AssetStore};
use axum::{
    Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, Request, State, WebSocketUpgrade},
    http::{HeaderMap, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
};
use breditor_collab_feasibility::rich_replica::Command;
pub use config::DocumentServerConfiguration;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    path::{Path as FsPath, PathBuf},
    sync::{Arc, Mutex, RwLock},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
pub use webhooks::{WEBHOOK_SIGNATURE_HEADER, sign_webhook, verify_webhook_signature};

const LIVE_SOCKETS: usize = 64;

#[derive(Clone)]
struct Entry {
    host: Host,
    service: Option<Arc<Mutex<injection::ServiceWriter>>>,
    stop: Arc<tokio::sync::watch::Sender<bool>>,
}
struct Inner {
    directory: PathBuf,
    authentication: Arc<Authentication>,
    config: DocumentServerConfiguration,
    rooms: RwLock<BTreeMap<String, Entry>>,
    webhooks: webhooks::Webhooks,
    operations: Arc<Semaphore>,
}

/// Opt-in authenticated document server over a host-owned directory of room logs.
///
/// Room `NAME` is stored as `NAME.log` with its raster store at `NAME.log.assets` and, once the
/// service principal has injected, its service-writer state at `NAME.service.json`. Archival moves
/// these files under `archive/`; nothing is deleted.
#[derive(Clone)]
pub struct DocumentServer {
    inner: Arc<Inner>,
}

fn valid_name(name: &str) -> bool {
    (1..=64).contains(&name.len())
        && name.bytes().next().is_some_and(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn reply(status: StatusCode, value: &Value) -> Response {
    let mut response =
        (status, [("content-type", "application/json")], value.to_string()).into_response();
    response
        .headers_mut()
        .insert("cache-control", axum::http::HeaderValue::from_static("no-store"));
    response
}
fn code(status: StatusCode, code: &str) -> Response {
    reply(status, &json!({"kind":"error","code":code}))
}
fn failure(error: &Error) -> Response {
    http::failure(error)
}

impl DocumentServer {
    /// Open every `NAME.log` room (with its asset store) in an existing host-owned directory.
    /// Must be called inside a Tokio runtime: webhook workers and room observers are spawned.
    /// # Errors
    /// Rejects a missing runtime, a service principal that is also a login account, invalid room
    /// files, more rooms than the configured budget, and storage failures.
    pub fn open(
        directory: &FsPath,
        authentication: Authentication,
        config: DocumentServerConfiguration,
    ) -> Result<Self> {
        tokio::runtime::Handle::try_current()
            .map_err(|_| Error::Contract("document server requires a Tokio runtime"))?;
        if let Some(service) = &config.service_principal
            && authentication.has_account(service)
        {
            return Err(Error::Contract("service principal must not be a login account"));
        }
        let server = Self {
            inner: Arc::new(Inner {
                directory: directory.to_path_buf(),
                authentication: Arc::new(authentication),
                webhooks: webhooks::Webhooks::start(&config.webhooks),
                operations: Arc::new(Semaphore::new(config.limits.concurrent_operations)),
                config,
                rooms: RwLock::new(BTreeMap::new()),
            }),
        };
        let mut names = Vec::new();
        for entry in std::fs::read_dir(directory)? {
            let path = entry?.path();
            if path.extension().is_some_and(|e| e == "log")
                && let Some(name) = path.file_stem().and_then(|s| s.to_str())
                && valid_name(name)
            {
                names.push(name.to_owned());
            }
        }
        names.sort();
        if names.len() > server.inner.config.limits.max_rooms {
            return Err(Error::Contract("document server room budget"));
        }
        for name in names {
            let (room, _) = Room::open(&server.log(&name))?;
            let assets = AssetStore::open(&server.assets(&name), room.asset_binding())?;
            server.insert(&name, room, assets)?;
        }
        Ok(server)
    }
    fn log(&self, name: &str) -> PathBuf {
        self.inner.directory.join(format!("{name}.log"))
    }
    fn assets(&self, name: &str) -> PathBuf {
        self.inner.directory.join(format!("{name}.log.assets"))
    }
    fn insert(&self, name: &str, room: Room, assets: AssetStore) -> Result<()> {
        let host = create_shared_host(room, self.inner.authentication.clone(), Some(assets));
        let service = self.inner.config.service_principal.clone().map(|principal| {
            Arc::new(Mutex::new(injection::ServiceWriter::new(
                self.inner.directory.join(format!("{name}.service.json")),
                principal,
            )))
        });
        let (stop, stopped) = tokio::sync::watch::channel(false);
        let mut rooms = self.inner.rooms.write().map_err(|_| Error::NeedsRecovery)?;
        if rooms.contains_key(name) {
            return Err(Error::Contract("room already served"));
        }
        if rooms.len() >= self.inner.config.limits.max_rooms {
            return Err(Error::Contract("document server room budget"));
        }
        if self.inner.webhooks.active() {
            watch::spawn(
                name.into(),
                host.clone(),
                self.inner.webhooks.clone(),
                self.inner.config.webhooks.debounce,
                stopped,
            );
        }
        rooms.insert(name.into(), Entry { host, service, stop: Arc::new(stop) });
        Ok(())
    }
    fn entry(&self, name: &str) -> Option<Entry> {
        self.inner.rooms.read().ok()?.get(name).cloned()
    }
    /// Currently served room names, in order.
    #[must_use]
    pub fn rooms(&self) -> Vec<String> {
        self.inner.rooms.read().map(|rooms| rooms.keys().cloned().collect()).unwrap_or_default()
    }
    /// Host-side administration inside one room's serialized transaction (for example enabling
    /// review or granting roles). Every room watch channel is notified afterwards, so connected
    /// sessions and webhook observers see the result exactly like a socket-originated change.
    /// # Errors
    /// Rejects an unknown room and returns the closure's own error.
    pub async fn with_room<T: Send + 'static>(
        &self,
        room: &str,
        f: impl FnOnce(&mut Room) -> Result<T> + Send + 'static,
    ) -> Result<T> {
        let entry = self.entry(room).ok_or(Error::Contract("unknown room"))?;
        let result = entry.host.transaction(f).await;
        entry.host.notify();
        entry.host.notify_review();
        entry.host.notify_document_versions();
        entry.host.notify_document_suggestions();
        result
    }
    /// Build the routes: `/health`, per-room `/rooms/{room}/ws` and `/rooms/{room}/assets/{id}`,
    /// and the authenticated `/documents/v1/...` API.
    pub fn router(&self) -> Router {
        Router::new()
            .route("/health", get(|| async { "breditor-relay-v1" }))
            .route("/rooms/{room}/ws", get(room_socket))
            .route(
                "/rooms/{room}/assets/{asset}",
                get(asset_download).put(asset_upload).options(asset_preflight),
            )
            .route("/documents/v1/rooms", get(list).post(create))
            .route("/documents/v1/rooms/{room}", get(snapshot).delete(archive))
            .route("/documents/v1/rooms/{room}/threads", get(threads))
            .route("/documents/v1/rooms/{room}/service-access", axum::routing::put(service_access))
            .route("/documents/v1/rooms/{room}/injections", axum::routing::post(inject))
            .route("/documents/v1/webhooks/deliveries", get(deliveries))
            .layer(DefaultBodyLimit::max(self.inner.config.limits.max_request_bytes))
            .with_state(self.clone())
    }
    /// Authenticate an API call: a present Origin must be allowed (no CORS is offered; this is a
    /// server-to-server API), then bearer token + principal, then the bounded operation budget.
    fn admit(
        &self,
        headers: &HeaderMap,
    ) -> std::result::Result<(String, OwnedSemaphorePermit), Response> {
        if headers.get("origin").is_some_and(|origin| {
            origin.to_str().map_or(true, |o| !self.inner.authentication.origin(o))
        }) {
            return Err(code(StatusCode::FORBIDDEN, "origin_rejected"));
        }
        let principal = http::account_for(&self.inner.authentication, headers)
            .map_err(|error| failure(&error))?;
        let permit = self
            .inner
            .operations
            .clone()
            .try_acquire_owned()
            .map_err(|_| code(StatusCode::SERVICE_UNAVAILABLE, "busy"))?;
        Ok((principal, permit))
    }
    async fn run<T: Send + 'static>(
        &self,
        host: &Host,
        f: impl FnOnce(&mut Room) -> Result<T> + Send + 'static,
    ) -> std::result::Result<T, Response> {
        match tokio::time::timeout(self.inner.config.limits.deadline, host.transaction(f)).await {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(error)) => Err(failure(&error)),
            Err(_) => Err(code(StatusCode::SERVICE_UNAVAILABLE, "deadline_exceeded")),
        }
    }
}

async fn room_socket(
    State(server): State<DocumentServer>,
    Path(room): Path<String>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    match server.entry(&room) {
        Some(entry) => super::upgrade(State(entry.host), headers, ws).await,
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn asset_download(
    State(server): State<DocumentServer>,
    Path((room, asset)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    match server.entry(&room) {
        Some(entry) => super::assets::download(State(entry.host), Path(asset), headers).await,
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn asset_upload(
    State(server): State<DocumentServer>,
    Path((room, asset)): Path<(String, String)>,
    request: Request,
) -> Response {
    match server.entry(&room) {
        Some(entry) => super::assets::upload(State(entry.host), Path(asset), request).await,
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn asset_preflight(
    State(server): State<DocumentServer>,
    Path((room, _)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    match server.entry(&room) {
        Some(entry) => super::assets::preflight(State(entry.host), headers).await,
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

macro_rules! admitted {
    ($server:expr, $headers:expr) => {
        match $server.admit(&$headers) {
            Ok(admitted) => admitted,
            Err(response) => return response,
        }
    };
}
macro_rules! room {
    ($server:expr, $room:expr) => {
        match $server.entry(&$room) {
            Some(entry) => entry,
            None => return code(StatusCode::NOT_FOUND, "not_found"),
        }
    };
}
macro_rules! ran {
    ($value:expr) => {
        match $value {
            Ok(value) => value,
            Err(response) => return response,
        }
    };
}

async fn list(State(server): State<DocumentServer>, headers: HeaderMap) -> Response {
    let (principal, _permit) = admitted!(server, headers);
    let entries: Vec<(String, Entry)> = server
        .inner
        .rooms
        .read()
        .map(|rooms| rooms.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default();
    let mut rooms = Vec::new();
    for (name, entry) in entries {
        let p = principal.clone();
        let role = ran!(server.run(&entry.host, move |room| Ok(room.account_role(&p))).await);
        if let Some(role) = role {
            rooms.push(json!({"room":name,"role":role}));
        }
    }
    reply(StatusCode::OK, &json!({"kind":"rooms","rooms":rooms}))
}

fn query(uri: &Uri, key: &str) -> Option<String> {
    uri.query()?.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        (k == key).then(|| v.to_owned())
    })
}
async fn snapshot(
    State(server): State<DocumentServer>,
    Path(name): Path<String>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    let (principal, _permit) = admitted!(server, headers);
    match query(&uri, "format").as_deref() {
        None | Some("json") => {}
        // HTML/Markdown export is the TypeScript interchange package's job, run by the caller
        // over this canonical JSON; the Rust relay has no second exporter to drift from it.
        Some(_) => return code(StatusCode::NOT_ACCEPTABLE, "unsupported_format"),
    }
    let entry = room!(server, name);
    let snapshot =
        ran!(server.run(&entry.host, move |room| room.document_snapshot(&principal)).await);
    let document: Value = match serde_json::from_str(&snapshot.document) {
        Ok(document) => document,
        Err(error) => return failure(&error.into()),
    };
    reply(
        StatusCode::OK,
        &json!({"format":"breditor/relay-document-snapshot","formatVersion":1,"room":name,
            "documentId":snapshot.document_id,"revision":snapshot.revision,
            "writerTransportVersion":snapshot.writer_transport_version,"document":document}),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateRequest {
    room: String,
    language_version: u32,
    #[serde(default)]
    standard: bool,
    configuration: Value,
    document: Value,
    #[serde(default)]
    service_access: bool,
}
fn create_room(path: &FsPath, request: &CreateRequest, owner: &str) -> Result<Room> {
    let configuration = request.configuration.to_string();
    let document = request.document.to_string();
    let (c, d) = (configuration.as_str(), document.as_str());
    match (request.language_version, request.standard) {
        (1, false) => Room::create(path, c, d, owner),
        (2, false) => Room::create_structural_v2(path, c, d, owner),
        (2, true) => Room::create_standard_structural_v2(path, c, d, owner),
        (3, false) => Room::create_layout_v3(path, c, d, owner),
        (3, true) => Room::create_standard_layout_v3(path, c, d, owner),
        (4, false) => Room::create_language_v4(path, c, d, owner),
        (4, true) => Room::create_standard_language_v4(path, c, d, owner),
        _ => Err(Error::Contract("rich language version")),
    }
}
async fn create(State(server): State<DocumentServer>, headers: HeaderMap, body: Bytes) -> Response {
    let (principal, _permit) = admitted!(server, headers);
    if !server.inner.config.creators.contains(&principal) {
        return failure(&Error::Permission);
    }
    let request: CreateRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(error) => return failure(&error.into()),
    };
    if !valid_name(&request.room) {
        return code(StatusCode::BAD_REQUEST, "invalid_room_name");
    }
    if server.entry(&request.room).is_some() || server.log(&request.room).exists() {
        return code(StatusCode::CONFLICT, "room_exists");
    }
    if server.rooms().len() >= server.inner.config.limits.max_rooms {
        return code(StatusCode::INSUFFICIENT_STORAGE, "room_budget");
    }
    let service = if request.service_access {
        match (&server.inner.config.service_principal, server.inner.config.injection) {
            (Some(service), true) => Some(service.clone()),
            _ => return code(StatusCode::BAD_REQUEST, "injection_disabled"),
        }
    } else {
        None
    };
    let (log, assets) = (server.log(&request.room), server.assets(&request.room));
    let owner = principal.clone();
    let created = tokio::task::spawn_blocking(move || -> Result<(Room, AssetStore, String)> {
        let mut room = create_room(&log, &request, &owner)?;
        if let Some(service) = service {
            room.grant(&owner, &service, Some(Role::Editor))?;
        }
        let store = AssetStore::open(&assets, room.asset_binding())?;
        Ok((room, store, request.room))
    })
    .await;
    let (room, store, name) = match created {
        Ok(Ok(created)) => created,
        Ok(Err(error)) => return failure(&error),
        Err(_) => return failure(&Error::NeedsRecovery),
    };
    let revision = room.document_revision().ok();
    if let Err(error) = server.insert(&name, room, store) {
        return failure(&error);
    }
    let _ = server.inner.webhooks.emit("room.created", &name, &json!({"createdBy":principal}));
    reply(StatusCode::CREATED, &json!({"kind":"created","room":name,"revision":revision}))
}

async fn archive(
    State(server): State<DocumentServer>,
    Path(name): Path<String>,
    headers: HeaderMap,
) -> Response {
    let (principal, _permit) = admitted!(server, headers);
    let entry = room!(server, name);
    if !ran!(server.run(&entry.host, move |room| room.is_owner(&principal)).await) {
        return failure(&Error::Permission);
    }
    {
        let Ok(mut rooms) = server.inner.rooms.write() else {
            return failure(&Error::NeedsRecovery);
        };
        // Retention: never sever live editors silently. The owner disconnects them first.
        if entry.host.connections.available_permits() != LIVE_SOCKETS {
            return code(StatusCode::CONFLICT, "room_in_use");
        }
        rooms.remove(&name);
    }
    entry.stop.send_replace(true);
    let service = entry.service.as_ref().and_then(|s| s.lock().ok().map(|s| s.path().to_owned()));
    drop(entry);
    let (directory, log, assets) =
        (server.inner.directory.clone(), server.log(&name), server.assets(&name));
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let archived_name = format!("{name}.{stamp}");
    let moved = tokio::task::spawn_blocking(move || -> Result<()> {
        let target = directory.join("archive");
        std::fs::create_dir_all(&target)?;
        std::fs::rename(&log, target.join(format!("{archived_name}.log")))?;
        if assets.exists() {
            std::fs::rename(&assets, target.join(format!("{archived_name}.log.assets")))?;
        }
        if let Some(service) = service.filter(|p| p.exists()) {
            std::fs::rename(&service, target.join(format!("{archived_name}.service.json")))?;
        }
        std::fs::File::open(&directory)?.sync_all()?;
        Ok(())
    })
    .await;
    match moved {
        Ok(Ok(())) => {}
        Ok(Err(error)) => return failure(&error),
        Err(_) => return failure(&Error::NeedsRecovery),
    }
    let _ = server.inner.webhooks.emit("room.deleted", &name, &json!({"archived":true}));
    reply(StatusCode::OK, &json!({"kind":"archived","room":name}))
}

async fn threads(
    State(server): State<DocumentServer>,
    Path(name): Path<String>,
    headers: HeaderMap,
) -> Response {
    let (principal, _permit) = admitted!(server, headers);
    let entry = room!(server, name);
    let views = ran!(server.run(&entry.host, move |room| room.review_threads(&principal)).await);
    reply(
        StatusCode::OK,
        &json!({"kind":"threads","room":name,"enabled":views.is_some(),
            "threads":views.unwrap_or_default()}),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ServiceAccess {
    editor: bool,
}
async fn service_access(
    State(server): State<DocumentServer>,
    Path(name): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let (principal, _permit) = admitted!(server, headers);
    let Some(service) = server.inner.config.service_principal.clone() else {
        return code(StatusCode::NOT_FOUND, "injection_disabled");
    };
    let request: ServiceAccess = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(error) => return failure(&error.into()),
    };
    let entry = room!(server, name);
    let role = request.editor.then_some(Role::Editor);
    // `grant` itself refuses any actor except the immutable room owner.
    ran!(server.run(&entry.host, move |room| room.grant(&principal, &service, role)).await);
    entry.host.notify();
    entry.host.notify_document_suggestions();
    reply(StatusCode::OK, &json!({"kind":"serviceAccess","editor":request.editor}))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InjectRequest {
    base_revision: String,
    commands: Vec<Value>,
}
fn commands(values: Vec<Value>, max: usize) -> std::result::Result<Vec<Command>, Response> {
    if values.is_empty() || values.len() > max {
        return Err(code(StatusCode::BAD_REQUEST, "command_budget"));
    }
    values
        .into_iter()
        .map(|value| {
            if !value["kind"].as_str().is_some_and(|kind| config::INJECTABLE.contains(&kind)) {
                return Err(code(StatusCode::BAD_REQUEST, "command_not_injectable"));
            }
            serde_json::from_value(value).map_err(|error| failure(&error.into()))
        })
        .collect()
}
async fn inject(
    State(server): State<DocumentServer>,
    Path(name): Path<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let (principal, _permit) = admitted!(server, headers);
    let config = &server.inner.config;
    if !config.injection || !config.injectors.contains(&principal) {
        return failure(&Error::Permission);
    }
    let request: InjectRequest = match serde_json::from_slice(&body) {
        Ok(request) => request,
        Err(error) => return failure(&error.into()),
    };
    if request.base_revision.len() > 64 * 1024 {
        return code(StatusCode::BAD_REQUEST, "invalid_request");
    }
    let commands = ran!(commands(request.commands, config.limits.max_commands));
    let entry = room!(server, name);
    let Some(service) = entry.service.clone() else {
        return code(StatusCode::NOT_FOUND, "injection_disabled");
    };
    let base = request.base_revision;
    let outcome = ran!(
        server
            .run(&entry.host, move |room| {
                // The calling account must itself currently hold Editor; the service principal
                // separately must hold Editor (checked by the service writer).
                room.require_editor(&principal)?;
                let mut writer = service.lock().map_err(|_| Error::NeedsRecovery)?;
                Ok(match writer.inject(room, &base, commands) {
                    Ok(outcome) => Ok((outcome, room.document_revision()?)),
                    Err(injection::Failure::Stale) => Err(room.document_revision()?),
                    Err(injection::Failure::Relay(error)) => return Err(error),
                })
            })
            .await
    );
    match outcome {
        Ok((injection::Outcome::Durable(receipt), revision)) => {
            entry.host.notify();
            reply(
                StatusCode::OK,
                &json!({"kind":"injected","author":config.service_principal,
                    "revision":revision,"receipt":receipt}),
            )
        }
        Ok((injection::Outcome::Unchanged, revision)) => {
            reply(StatusCode::OK, &json!({"kind":"unchanged","revision":revision}))
        }
        Err(current) => reply(
            StatusCode::CONFLICT,
            &json!({"kind":"error","code":"stale_revision","revision":current}),
        ),
    }
}

async fn deliveries(State(server): State<DocumentServer>, headers: HeaderMap) -> Response {
    let (principal, _permit) = admitted!(server, headers);
    if !server.inner.config.administrators.contains(&principal) {
        return failure(&Error::Permission);
    }
    reply(
        StatusCode::OK,
        &json!({"kind":"deliveries","deliveries":server.inner.webhooks.deliveries()}),
    )
}
