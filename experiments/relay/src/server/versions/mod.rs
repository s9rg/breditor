//! Bounded authenticated HTTP catalog transport. Version packets stay raw JSON, not escaped
//! inside a six-MiB socket envelope; the original four-MiB native packet budget is unchanged.
mod account;
mod describe;
mod download;
mod list;
mod publish;
use super::{
    Host,
    http::{cors, failure, origin},
};
use crate::{DocumentVersionsDescriptor, Error, Result, Room};
pub(super) use account::account;
use axum::{
    body::{Body, to_bytes},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
pub(super) use describe::describe;
pub(super) use download::download;
pub(super) use list::list;
pub(super) use publish::publish;
use std::time::Duration;

fn binding(headers: &HeaderMap) -> Result<String> {
    headers
        .get("x-breditor-catalog")
        .and_then(|h| h.to_str().ok())
        .filter(|s| s.len() == 64)
        .map(str::to_owned)
        .ok_or(Error::Contract("version catalog binding header required"))
}
fn bound(room: &Room, principal: &str, binding: &str) -> Result<DocumentVersionsDescriptor> {
    let descriptor = room.document_versions_descriptor(principal)?;
    if descriptor.binding != binding {
        return Err(Error::Contract("version catalog binding differs"));
    }
    Ok(descriptor)
}
pub(super) async fn body(body: Body, limit: usize) -> std::result::Result<Vec<u8>, StatusCode> {
    match tokio::time::timeout(Duration::from_secs(10), to_bytes(body, limit)).await {
        Ok(Ok(bytes)) => Ok(bytes.to_vec()),
        Ok(Err(_)) => Err(StatusCode::PAYLOAD_TOO_LARGE),
        Err(_) => Err(StatusCode::REQUEST_TIMEOUT),
    }
}
fn json(value: serde_json::Value) -> Response {
    let encoded = value.to_string();
    drop(value);
    ([("content-type", "application/json")], encoded).into_response()
}
pub(super) async fn preflight(
    axum::extract::State(host): axum::extract::State<Host>,
    headers: HeaderMap,
) -> Response {
    let Some(allowed) = origin(&host, &headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let method = headers.get("access-control-request-method").and_then(|h| h.to_str().ok());
    let valid = headers
        .get("access-control-request-headers")
        .and_then(|h| h.to_str().ok())
        .is_none_or(|value| {
            value.split(',').all(|h| {
                matches!(
                    h.trim().to_ascii_lowercase().as_str(),
                    "authorization"
                        | "x-breditor-principal"
                        | "x-breditor-principal-utf8"
                        | "content-type"
                        | "x-breditor-catalog"
                )
            })
        });
    let response = if matches!(method, Some("GET" | "POST")) && valid {
        (
            StatusCode::NO_CONTENT,
            [
                ("access-control-allow-methods", "GET, POST"),
                (
                    "access-control-allow-headers",
                    "Authorization, X-Breditor-Principal, X-Breditor-Principal-Utf8, Content-Type, X-Breditor-Catalog",
                ),
            ],
        )
            .into_response()
    } else {
        StatusCode::FORBIDDEN.into_response()
    };
    cors(response, allowed)
}
