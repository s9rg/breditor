//! Shared exact-Origin/account admission and non-sensitive HTTP failure rendering.
use super::Host;
use crate::{Error, Result};
use axum::{
    http::{HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
pub(super) fn origin<'a>(host: &Host, headers: &'a HeaderMap) -> Option<&'a str> {
    headers.get("origin").and_then(|h| h.to_str().ok()).filter(|o| host.authentication.origin(o))
}
pub(super) fn account(host: &Host, headers: &HeaderMap) -> Result<String> {
    account_for(&host.authentication, headers)
}
pub(super) fn account_for(
    authentication: &super::Authentication,
    headers: &HeaderMap,
) -> Result<String> {
    let principal = headers
        .get("x-breditor-principal")
        .and_then(|h| h.to_str().ok())
        .ok_or(Error::Permission)?;
    let token = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or(Error::Permission)?;
    authentication.authenticate(principal, token)?;
    Ok(principal.into())
}
pub(super) fn cors(mut response: Response, allowed: &str) -> Response {
    let headers = response.headers_mut();
    if let Ok(value) = HeaderValue::from_str(allowed) {
        headers.insert("access-control-allow-origin", value);
    }
    headers.insert("vary", HeaderValue::from_static("Origin"));
    headers.insert("cache-control", HeaderValue::from_static("no-store"));
    headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
    response
}
pub(super) fn failure(error: &Error) -> Response {
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
