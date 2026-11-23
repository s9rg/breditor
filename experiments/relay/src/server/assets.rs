//! Authenticated bounded HTTP transfer. Native raster decoding happens before serialized fsync;
//! permission is checked both before reading the body and again before publishing bytes.
use super::{
    Host,
    continued_assets::HttpRasterStore,
    http::{account, cors, failure, origin},
};
use crate::{
    Error, Result,
    assets::{self, MAX_ASSET_BYTES, PreparedAsset},
};
use axum::{
    body::{Body, to_bytes},
    extract::{Path, Request, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::json;
use tokio::sync::OwnedSemaphorePermit;

/// Whole-body deadline for one asset upload: about 1.4 Mbit/s for the 10 MiB maximum.
const UPLOAD_BODY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

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
    let Ok(permit) = host.asset_operations.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    let result = host
        .transaction(move |room| {
            let stored = store.read(room, &principal, &asset)?;
            Ok((stored, permit))
        })
        .await;
    let response = match result {
        Ok((Some(stored), _permit)) => {
            ([("content-type", stored.info.mime.as_str())], Body::from(stored.bytes))
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
    let p = principal.clone();
    if let Err(e) = host.transaction(move |room| room.editor(&p)).await {
        return cors(failure(&e), allowed);
    }
    let Ok(permit) = host.asset_operations.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
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
    let (prepared, permit) =
        match prepare_upload(permit, move || assets::prepare_asset(&asset, &mime, bytes)).await {
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
    use std::{
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
}
