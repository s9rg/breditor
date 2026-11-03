//! Exact Origin/account and bounded body admission precede one owned worker.
use super::{NativeRoomPublicationRequest, state::State};
use crate::{Error, server::http};
use axum::{
    Router,
    body::to_bytes,
    extract::{Request, State as Extract},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
};
use std::sync::Weak;
const REQUEST_BYTES: usize = 64 * 1024;
pub(super) fn router(state: Weak<State>) -> Router {
    Router::new()
        .route("/recovery/native-publication/v1/publish", post(publish).options(preflight))
        .with_state(state)
}
async fn preflight(Extract(weak): Extract<Weak<State>>, headers: HeaderMap) -> Response {
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(origin) = headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .filter(|value| state.native.state.operators.origin(value))
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if headers.get("access-control-request-method").and_then(|v| v.to_str().ok()) != Some("POST")
        || headers.get("access-control-request-headers").is_some_and(|h| {
            h.to_str().ok().is_none_or(|value| {
                value.split(',').any(|name| {
                    !["authorization", "content-type", "x-breditor-principal"]
                        .contains(&name.trim().to_ascii_lowercase().as_str())
                })
            })
        })
    {
        return http::cors(StatusCode::FORBIDDEN.into_response(), origin);
    }
    http::cors(
        (
            StatusCode::NO_CONTENT,
            [
                ("access-control-allow-methods", "POST, OPTIONS"),
                (
                    "access-control-allow-headers",
                    "authorization, content-type, x-breditor-principal",
                ),
            ],
        )
            .into_response(),
        origin,
    )
}
pub(super) async fn publish(Extract(weak): Extract<Weak<State>>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let headers = parts.headers;
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(origin) = headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .filter(|value| state.native.state.operators.origin(value))
        .map(str::to_owned)
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let principal = match http::account_for(&state.native.state.operators, &headers) {
        Ok(value) => value,
        Err(error) => return http::cors(http::failure(&error), &origin),
    };
    let digest = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .and_then(|v| crate::credentials::hash(v).ok());
    let Some(digest) = digest else {
        return http::cors(http::failure(&Error::Permission), &origin);
    };
    if headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .and_then(|value| value.split(';').next())
        != Some("application/json")
    {
        return http::cors(
            http::failure(&Error::Contract("publication request content type")),
            &origin,
        );
    }
    let Ok(permit) = state.requests.clone().try_acquire_owned() else {
        return http::cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), &origin);
    };
    // A pending body retains quota only, not a source, listener or Native owner.
    drop(state);
    let Ok(body) = to_bytes(body, REQUEST_BYTES).await else {
        return http::cors(StatusCode::PAYLOAD_TOO_LARGE.into_response(), &origin);
    };
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return http::cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), &origin);
    };
    let result = super::super::super::control_work::run(permit, async move {
        let selected: NativeRoomPublicationRequest = serde_json::from_slice(&body)?;
        state.publish(&selected, &principal, &digest)
    })
    .await;
    http::cors(
        match result {
            Ok(bytes) => ([("content-type", "application/json")], bytes).into_response(),
            Err(error) => http::failure(&error),
        },
        &origin,
    )
}
