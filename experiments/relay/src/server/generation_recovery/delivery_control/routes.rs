//! Bounded separate operator read, sharing actual current quota without holding idle native custody.
use super::{ServerLogGenerationDeliveryRecoveryControlIdentity, lease::State};
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
// Separate envelope repeats full literal old/current pins; old route bounds stay unchanged.
const MAX_BYTES: usize = 256 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    selection: &'a ServerLogGenerationDeliveryRecoveryControlIdentity,
    scope: &'static str,
}
pub(super) fn router(state: Weak<State>) -> Router {
    Router::new()
        .route("/recovery/generation-delivery/v1/check", post(check).options(preflight))
        .with_state(state)
}
async fn preflight(Extract(weak): Extract<Weak<State>>, headers: HeaderMap) -> Response {
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(origin) = headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .filter(|origin| state.current.state.operators.origin(origin))
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if headers.get("access-control-request-method").and_then(|value| value.to_str().ok())
        != Some("POST")
        || headers.get("access-control-request-headers").is_some_and(|value| {
            value.to_str().ok().is_none_or(|text| {
                text.split(',').any(|name| {
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
async fn read(state: Arc<State>, body: Bytes) -> Result<Vec<u8>> {
    state.local()?;
    let selected: ServerLogGenerationDeliveryRecoveryControlIdentity =
        serde_json::from_slice(&body)?;
    if selected != state.selection {
        return Err(Error::Contract("delivery operator previous/current selection differs"));
    }
    let held = state.clone();
    let bytes = tokio::task::spawn_blocking(move || {
        held.local()?;
        let bytes = serde_json::to_vec(&Read {
            format: "breditor/server-log-generation-delivery-recovery-control-read",
            format_version: 1,
            selection: &held.selection,
            scope: "complete-previous-native-server-cut-and-current-provider",
        })?;
        if bytes.len() > MAX_BYTES {
            return Err(Error::Contract("delivery operator response budget"));
        }
        Ok::<_, Error>(bytes)
    })
    .await
    .map_err(|_| Error::NeedsRecovery)??;
    // This proof already brackets provider callbacks with native checks.
    state.check().await?;
    Ok(bytes)
}
pub(super) async fn check(Extract(weak): Extract<Weak<State>>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let headers = parts.headers;
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(origin) = headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .filter(|origin| state.current.state.operators.origin(origin))
        .map(str::to_owned)
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if let Err(error) = http::account_for(&state.current.state.operators, &headers) {
        return http::cors(http::failure(&error), &origin);
    }
    if headers
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .and_then(|text| text.split(';').next())
        != Some("application/json")
    {
        return http::cors(
            http::failure(&Error::Contract("delivery operator request content type")),
            &origin,
        );
    }
    let Ok(permit) = state.current.state.requests.clone().try_acquire_owned() else {
        return http::cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), &origin);
    };
    drop(state); // Body-only admission retains no host/provider/native lease.
    let Ok(body) = to_bytes(body, MAX_BYTES).await else {
        return http::cors(StatusCode::PAYLOAD_TOO_LARGE.into_response(), &origin);
    };
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return http::cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), &origin);
    };
    http::cors(
        match crate::server::generation_recovery::control_work::run(permit, read(state, body)).await
        {
            Ok(bytes) => ([("content-type", "application/json")], bytes).into_response(),
            Err(error) => http::failure(&error),
        },
        &origin,
    )
}
