//! Bounded exact-Origin operator read; no DTO can substitute for genuine native/provider owners.
use super::{PhysicalRoomRecoveryControlIdentity, lease::State};
use crate::{Error, Result, server::http};
use axum::{
    Router,
    body::{Bytes, to_bytes},
    extract::{Request, State as Extract},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::post,
};
use serde::Serialize;
use std::sync::{Arc, Weak};

const REQUEST_BYTES: usize = 64 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    selection: &'a PhysicalRoomRecoveryControlIdentity,
    scope: &'static str,
}
pub(super) fn router(state: Weak<State>) -> Router {
    Router::new()
        .route("/recovery/physical/v1/check", post(check).options(preflight))
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
async fn read(state: Arc<State>, body: Bytes) -> Result<Vec<u8>> {
    state.local()?;
    let selection: PhysicalRoomRecoveryControlIdentity = serde_json::from_slice(&body)?;
    if selection != state.selection {
        return Err(Error::Contract(
            "operator selected control instance or physical source differs",
        ));
    }
    state.check().await?;
    let held = state.clone();
    let bytes = tokio::task::spawn_blocking(move || {
        held.local()?;
        let read = Read {
            format: "breditor/physical-room-recovery-control-read",
            format_version: 1,
            selection: &held.selection,
            scope: "native-physical-and-server-provider",
        };
        let bytes = serde_json::to_vec(&read)?;
        if bytes.len() > REQUEST_BYTES {
            return Err(Error::Contract("operator complete response budget"));
        }
        Ok::<_, Error>(bytes)
    })
    .await
    .map_err(|_| Error::NeedsRecovery)??;
    // No provider/user callback or serialization await follows this final complete native check.
    state.check().await?;
    Ok(bytes)
}
async fn check(Extract(weak): Extract<Weak<State>>, request: Request) -> Response {
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
    let Ok(_permit) = state.requests.clone().try_acquire_owned() else {
        return http::cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), &origin);
    };
    let Ok(body) = to_bytes(body, REQUEST_BYTES).await else {
        return http::cors(StatusCode::PAYLOAD_TOO_LARGE.into_response(), &origin);
    };
    let result = read(state, body).await;
    http::cors(
        match result {
            Ok(bytes) => ([("content-type", "application/json")], bytes).into_response(),
            Err(error) => http::failure(&error),
        },
        &origin,
    )
}
