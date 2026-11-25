//! Authenticated bounded HTTP transfer. Native raster decoding happens before serialized fsync;
//! permission is checked both before reading the body and again before publishing bytes.
use super::{
    Host,
    continued_assets::HttpRasterStore,
    http::{account, cors, failure, origin, retained_body},
};
use crate::{
    Error, Result,
    assets::{self, MAX_ASSET_BYTES, PreparedAsset},
};
use axum::{
    body::to_bytes,
    extract::{Path, Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

/// Whole-body deadline for one asset upload: about 1.4 Mbit/s for the 10 MiB maximum.
const UPLOAD_BODY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
pub(super) const TRANSFER_SLOTS: u32 = 4;

pub(super) struct Operations {
    permits: Arc<Semaphore>,
    worker: Option<Arc<super::raster_worker::Worker>>,
}

impl Operations {
    pub(super) fn new(worker: Option<super::raster_worker::Worker>) -> Self {
        Self {
            permits: Arc::new(Semaphore::new(TRANSFER_SLOTS as usize)),
            worker: worker.map(Arc::new),
        }
    }

    pub(super) fn transfer_slots(&self) -> Arc<Semaphore> {
        self.permits.clone()
    }
}

pub(super) async fn preflight(State(host): State<Host>, headers: HeaderMap) -> Response {
    let Some(allowed) = origin(&host, &headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if !host.serves_assets() {
        return cors(StatusCode::NOT_FOUND.into_response(), allowed);
    }
    let method = headers.get("access-control-request-method").and_then(|h| h.to_str().ok());
    let valid_headers = headers
        .get("access-control-request-headers")
        .and_then(|h| h.to_str().ok())
        .is_none_or(|v| {
            v.split(',').all(|h| {
                matches!(
                    h.trim().to_ascii_lowercase().as_str(),
                    "authorization" | "x-breditor-principal" | "content-type"
                )
            })
        });
    let result = if matches!(method, Some("GET" | "PUT")) && valid_headers {
        (
            StatusCode::NO_CONTENT,
            [
                ("access-control-allow-methods", "GET, PUT"),
                (
                    "access-control-allow-headers",
                    "Authorization, X-Breditor-Principal, Content-Type",
                ),
            ],
        )
            .into_response()
    } else {
        StatusCode::FORBIDDEN.into_response()
    };
    cors(result, allowed)
}
pub(super) async fn download(
    State(host): State<Host>,
    Path(asset): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Some(allowed) = origin(&host, &headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let Some(store) = HttpRasterStore::of(&host) else {
        return cors(StatusCode::NOT_FOUND.into_response(), allowed);
    };
    let principal = match account(&host, &headers) {
        Ok(p) => p,
        Err(e) => return cors(failure(&e), allowed),
    };
    let Ok(permit) = host.asset_operations.permits.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    let result = host
        .transaction(move |room| {
            let stored = store.read(room, &principal, &asset)?;
            Ok((stored, permit))
        })
        .await;
    let response = match result {
        Ok((Some(stored), permit)) => {
            ([("content-type", stored.info.mime.as_str())], retained_body(stored.bytes, permit))
                .into_response()
        }
        Ok((None, _permit)) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => failure(&e),
    };
    cors(response, allowed)
}
pub(super) async fn upload(
    State(host): State<Host>,
    Path(asset): Path<String>,
    request: Request,
) -> Response {
    let (parts, body) = request.into_parts();
    let Some(allowed) = origin(&host, &parts.headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let Some(store) = HttpRasterStore::of(&host) else {
        return cors(StatusCode::NOT_FOUND.into_response(), allowed);
    };
    let principal = match account(&host, &parts.headers) {
        Ok(p) => p,
        Err(e) => return cors(failure(&e), allowed),
    };
    let Ok(permit) = host.asset_operations.permits.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    let p = principal.clone();
    // A disconnected request can leave its blocking role check queued. Keep the same slot
    // until that check completes to keep the room's queue bounded under churn.
    let permit = match host.transaction(move |room| room.editor(&p).map(|()| permit)).await {
        Ok(permit) => permit,
        Err(e) => return cors(failure(&e), allowed),
    };
    let Some(mime) =
        parts.headers.get("content-type").and_then(|h| h.to_str().ok()).map(str::to_owned)
    else {
        return cors(failure(&Error::Contract("asset MIME required")), allowed);
    };
    let Ok(limit) = usize::try_from(MAX_ASSET_BYTES) else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    // The permit is shared with downloads, so a stalled body must not hold it indefinitely.
    let bytes = match tokio::time::timeout(UPLOAD_BODY_TIMEOUT, to_bytes(body, limit)).await {
        Ok(Ok(bytes)) => bytes.to_vec(),
        Ok(Err(_)) => return cors(StatusCode::PAYLOAD_TOO_LARGE.into_response(), allowed),
        Err(_) => return cors(StatusCode::REQUEST_TIMEOUT.into_response(), allowed),
    };
    let prepared = if let Some(worker) = host.asset_operations.worker.clone() {
        // Disconnecting the HTTP client does not cancel the supervised child or free its slot.
        tokio::spawn(async move { Ok((worker.prepare(&asset, &mime, bytes).await?, permit)) })
            .await
            .unwrap_or(Err(Error::NeedsRecovery))
    } else {
        prepare_upload(permit, move || assets::prepare_asset(&asset, &mime, bytes)).await
    };
    let (prepared, permit) = match prepared {
        Ok(value) => value,
        Err(e) => return cors(failure(&e), allowed),
    };
    let result = host
        .transaction(move |room| {
            let receipt = store.put(room, &principal, prepared)?;
            Ok((receipt, permit))
        })
        .await;
    let response = match result {
        Ok((receipt, _permit)) => {
            if !receipt.duplicate {
                host.assets_changed.send_modify(|n| *n = n.wrapping_add(1));
            }
            (StatusCode::OK, [("content-type", "application/json")], json!(receipt).to_string())
                .into_response()
        }
        Err(e) => failure(&e),
    };
    cors(response, allowed)
}

/// Blocking work can outlive an HTTP waiter. Transfer its slot with the result.
async fn prepare_upload(
    permit: OwnedSemaphorePermit,
    prepare: impl FnOnce() -> Result<PreparedAsset> + Send + 'static,
) -> Result<(PreparedAsset, OwnedSemaphorePermit)> {
    tokio::task::spawn_blocking(move || Ok((prepare()?, permit)))
        .await
        .map_err(|_| Error::NeedsRecovery)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Role, room::segment_handover_test_source, server::Authentication};
    use axum::{
        body::Body,
        http::{HeaderValue, Request as HttpRequest},
    };
    use std::{
        io::Cursor,
        sync::{Arc, mpsc},
        time::Duration,
    };
    use tokio::{
        sync::{Semaphore, oneshot},
        time::timeout,
    };

    #[tokio::test]
    async fn cancelling_the_upload_waiter_keeps_the_blocking_decode_slot() {
        let deadline = Duration::from_secs(5);
        let slots = Arc::new(Semaphore::new(1));
        let permit = slots.clone().try_acquire_owned().unwrap();
        let (started, entered) = oneshot::channel();
        let (release, blocked) = mpsc::channel();
        let request = tokio::spawn(prepare_upload(permit, move || {
            started.send(()).unwrap();
            blocked.recv_timeout(deadline).unwrap();
            Err(Error::Contract("test decode finished"))
        }));

        timeout(deadline, entered).await.unwrap().unwrap();
        request.abort();
        assert!(request.await.err().unwrap().is_cancelled());
        let slot_retained = slots.available_permits() == 0;
        release.send(()).unwrap();
        assert!(slot_retained);
        let _released = timeout(deadline, slots.acquire()).await.unwrap().unwrap();
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn idle_wait_includes_an_isolated_worker_after_its_upload_is_cancelled()
    -> std::result::Result<(), Box<dyn std::error::Error>> {
        use std::{fs, io::Write, os::unix::fs::OpenOptionsExt};

        const ORIGIN: &str = "http://127.0.0.1:4187";
        let (files, room, _) = segment_handover_test_source(1, false, false)?;
        let path = files.room().with_extension("assets");
        let store = assets::AssetStore::open(&path, room.asset_binding())?;
        let executable = files.room().with_extension("worker");
        let mut file =
            fs::OpenOptions::new().write(true).create_new(true).mode(0o700).open(&executable)?;
        file.write_all(
            br#"#!/bin/sh
/bin/cat >/dev/null
: > "$0.started"
while [ ! -f "$0.release" ]; do /bin/sleep 0.025; done
printf '%s\n' '{"status":"rejected"}'
"#,
        )?;
        drop(file);
        let (token, hash) = Authentication::issue_token()?;
        let auth = Authentication::from_json(
            &json!({
                "format":"breditor/relay-auth", "formatVersion":1, "origins":[ORIGIN],
                "accounts":[{"principal":"owner", "tokenHash":hash}],
            })
            .to_string(),
        )?;
        let worker = super::super::raster_worker::Worker::new(executable.clone())?;
        let monitor = worker.monitor();
        let mut host = super::super::create_host(room, auth, Some(store));
        host.asset_operations = Arc::new(Operations::new(Some(worker)));
        let monitor = monitor.with_transfer_slots(host.asset_operations.transfer_slots());
        let bytes = b"local rejected raster fixture";
        let asset = assets::asset_id(bytes);
        let request = HttpRequest::builder()
            .header("origin", ORIGIN)
            .header("x-breditor-principal", "owner")
            .header("authorization", format!("Bearer {token}"))
            .header("content-type", "image/png")
            .body(Body::from(&bytes[..]))?;
        let client = tokio::spawn(upload(State(host), Path(asset), request));
        let started = executable.with_extension("worker.started");
        timeout(Duration::from_secs(5), async {
            while !started.exists() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await?;
        client.abort();
        assert!(client.await.err().is_some_and(|error| error.is_cancelled()));
        assert_eq!(monitor.snapshot().rejected, 0);
        let mut drain = std::pin::pin!(monitor.wait_for_idle());
        let waited_for_worker = timeout(Duration::from_millis(100), drain.as_mut()).await.is_err();
        fs::write(executable.with_extension("worker.release"), [])?;
        assert!(waited_for_worker, "shutdown must wait for an upload's detached worker");
        timeout(Duration::from_secs(5), drain).await?;
        let stats = monitor.snapshot();
        assert_eq!((stats.admitted, stats.rejected, stats.timed_out, stats.failed), (0, 1, 0, 0));
        Ok(())
    }

    #[tokio::test]
    async fn download_bytes_hold_capacity_and_upload_admission_checks_capacity_before_role()
    -> std::result::Result<(), Box<dyn std::error::Error>> {
        const ORIGIN: &str = "http://127.0.0.1:4187";
        let (files, mut room, _) = segment_handover_test_source(1, false, false)?;
        room.grant("owner", "reader", Some(Role::Reader))?;
        let path = files.room().with_extension("assets");
        let mut store = assets::AssetStore::open(&path, room.asset_binding())?;
        let mut encoded = Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(2, 3).write_to(&mut encoded, image::ImageFormat::Png)?;
        let bytes = encoded.into_inner();
        let asset = assets::asset_id(&bytes);
        store.put(assets::prepare_asset(&asset, "image/png", bytes.clone())?)?;
        let (token, hash) = Authentication::issue_token()?;
        let auth = Authentication::from_json(
            &json!({
                "format":"breditor/relay-auth", "formatVersion":1, "origins":[ORIGIN],
                "accounts":[{"principal":"reader", "tokenHash":hash}],
            })
            .to_string(),
        )?;
        let host = super::super::create_host(room, auth, Some(store));
        let auth_header = HeaderValue::from_str(&format!("Bearer {token}"))?;
        let request = |auth: HeaderValue| {
            HttpRequest::builder()
                .header("origin", ORIGIN)
                .header("x-breditor-principal", "reader")
                .header("authorization", auth)
                .header("content-type", "image/png")
                .body(Body::empty())
        };
        let occupied = host.asset_operations.permits.clone().try_acquire_many_owned(3)?;
        let response = download(
            State(host.clone()),
            Path(asset.clone()),
            request(auth_header.clone())?.headers().clone(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let payload = to_bytes(response.into_body(), bytes.len()).await?;
        assert_eq!(payload.as_ref(), bytes);
        let pending = payload.clone();
        drop(payload);
        assert_eq!(host.asset_operations.permits.available_permits(), 0);
        let no_code = upload(
            State(host.clone()),
            Path(asset.clone()),
            request(HeaderValue::from_static("Bearer invalid"))?,
        )
        .await;
        assert_eq!(no_code.status(), StatusCode::FORBIDDEN);
        let busy =
            upload(State(host.clone()), Path(asset.clone()), request(auth_header.clone())?).await;
        assert_eq!(busy.status(), StatusCode::SERVICE_UNAVAILABLE);
        drop(pending);
        let denied = upload(State(host.clone()), Path(asset), request(auth_header)?).await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        assert_eq!(host.asset_operations.permits.available_permits(), 1);
        drop(occupied);
        Ok(())
    }
}
