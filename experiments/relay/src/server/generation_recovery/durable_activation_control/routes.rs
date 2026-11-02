//! Exact-Origin operator admission precedes bounded body IO and one owned worker.
use super::{DurableNativeActivationControlIdentity, state::State};
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
        .route("/recovery/native-activation/v1/commit", post(commit).options(preflight))
        .with_state(state)
}
async fn preflight(Extract(weak): Extract<Weak<State>>, headers: HeaderMap) -> Response {
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(origin) = headers
        .get("origin")
        .and_then(|h| h.to_str().ok())
        .filter(|value| state.operators.origin(value))
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if headers.get("access-control-request-method").and_then(|h| h.to_str().ok()) != Some("POST") {
        return http::cors(StatusCode::FORBIDDEN.into_response(), origin);
    }
    if headers.get("access-control-request-headers").is_some_and(|h| {
        h.to_str().ok().is_none_or(|value| {
            value.split(',').any(|name| {
                !["authorization", "content-type", "x-breditor-principal"]
                    .contains(&name.trim().to_ascii_lowercase().as_str())
            })
        })
    }) {
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
pub(super) async fn commit(Extract(weak): Extract<Weak<State>>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let headers = parts.headers;
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(origin) = headers
        .get("origin")
        .and_then(|h| h.to_str().ok())
        .filter(|value| state.operators.origin(value))
        .map(str::to_owned)
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if let Err(error) = http::account_for(&state.operators, &headers) {
        return http::cors(http::failure(&error), &origin);
    }
    if headers
        .get("content-type")
        .and_then(|h| h.to_str().ok())
        .and_then(|value| value.split(';').next())
        != Some("application/json")
    {
        return http::cors(
            http::failure(&Error::Contract("operator request content type")),
            &origin,
        );
    }
    let Ok(permit) = state.requests.clone().try_acquire_owned() else {
        return http::cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), &origin);
    };
    // An incomplete body holds only the quota, not native owners or leases.
    drop(state);
    let Ok(body) = to_bytes(body, REQUEST_BYTES).await else {
        return http::cors(StatusCode::PAYLOAD_TOO_LARGE.into_response(), &origin);
    };
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return http::cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), &origin);
    };
    let result = super::super::control_work::run(permit, async move {
        let selected: DurableNativeActivationControlIdentity = serde_json::from_slice(&body)?;
        state.commit(&selected)
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
