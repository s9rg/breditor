//! Authenticated bounded HTTP transfer. Native raster decoding happens before serialized fsync;
//! permission is checked both before reading the body and again before publishing bytes.
use super::Host;
use crate::{
    Error, Result,
    assets::{self, MAX_ASSET_BYTES},
};
use axum::{
    body::{Body, to_bytes},
    extract::{Path, Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::json;

fn origin<'a>(host: &Host, headers: &'a HeaderMap) -> Option<&'a str> {
    headers.get("origin").and_then(|h| h.to_str().ok()).filter(|o| host.authentication.origin(o))
}
fn account(host: &Host, headers: &HeaderMap) -> Result<String> {
    let principal = headers
        .get("x-breditor-principal")
        .and_then(|h| h.to_str().ok())
        .ok_or(Error::Permission)?;
    let token = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or(Error::Permission)?;
    host.authentication.authenticate(principal, token)?;
    Ok(principal.into())
}
fn cors(mut response: Response, allowed: &str) -> Response {
    let headers = response.headers_mut();
    if let Ok(value) = HeaderValue::from_str(allowed) {
        headers.insert("access-control-allow-origin", value);
    }
    headers.insert("vary", HeaderValue::from_static("Origin"));
    headers.insert("cache-control", HeaderValue::from_static("no-store"));
    headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    response
}
fn failure(error: &Error) -> Response {
    let status = match error {
        Error::Permission | Error::Lease => StatusCode::FORBIDDEN,
        Error::NeedsRecovery | Error::Io(_) | Error::Locked | Error::Entropy => {
            StatusCode::SERVICE_UNAVAILABLE
        }
        _ => StatusCode::BAD_REQUEST,
    };
    (status, [("content-type", "application/json")], super::wire::error(error).to_string())
        .into_response()
}
pub(super) async fn preflight(State(host): State<Host>, headers: HeaderMap) -> Response {
    let Some(allowed) = origin(&host, &headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if host.assets.is_none() {
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
    let Some(store) = host.assets.clone() else {
        return cors(StatusCode::NOT_FOUND.into_response(), allowed);
    };
    let principal = match account(&host, &headers) {
        Ok(p) => p,
        Err(e) => return cors(failure(&e), allowed),
    };
    let Ok(_permit) = host.asset_operations.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    let result = host
        .transaction(move |room| {
            let store = store.lock().map_err(|_| Error::NeedsRecovery)?;
            room.read_asset(&principal, &store, &asset)
        })
        .await;
    let response = match result {
        Ok(Some(stored)) => {
            ([("content-type", stored.info.mime.as_str())], Body::from(stored.bytes))
                .into_response()
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
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
    let Some(store) = host.assets.clone() else {
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
    let Ok(_permit) = host.asset_operations.clone().try_acquire_owned() else {
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
    let bytes = match to_bytes(body, limit).await {
        Ok(bytes) => bytes.to_vec(),
        Err(_) => return cors(StatusCode::PAYLOAD_TOO_LARGE.into_response(), allowed),
    };
    let prepared = tokio::task::spawn_blocking(move || assets::prepare_asset(&asset, &mime, bytes))
        .await
        .unwrap_or(Err(Error::NeedsRecovery));
    let result = match prepared {
        Ok(prepared) => {
            host.transaction(move |room| {
                let mut store = store.lock().map_err(|_| Error::NeedsRecovery)?;
                room.put_asset(&principal, &mut store, prepared)
            })
            .await
        }
        Err(e) => Err(e),
    };
    let response = match result {
        Ok(receipt) => {
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
