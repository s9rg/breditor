//! Bounded separate operator read, sharing actual current quota without holding idle native custody.
use super::{ServerLogGenerationDeliveryPathRecoveryControlIdentity, lease::State};
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
// Explicit whole-path envelope; old current/single-prior bounds are never widened.
pub(super) const MAX_BYTES: usize = 16 * 1024 * 1024;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    selection: &'a ServerLogGenerationDeliveryPathRecoveryControlIdentity,
    scope: &'static str,
}
pub(super) fn check_envelope(
    selection: &ServerLogGenerationDeliveryPathRecoveryControlIdentity,
) -> Result<()> {
    let bytes = serde_json::to_vec(&Read {
        format: "breditor/server-log-generation-delivery-path-recovery-control-read",
        format_version: 1,
        selection,
        scope: "complete-ordered-native-server-path-and-current-provider",
    })?;
    if bytes.len() > MAX_BYTES {
        return Err(Error::Contract("delivery path operator envelope budget"));
    }
    Ok(())
}
pub(super) fn router(state: Weak<State>, handover: bool) -> Router {
    let mut router = Router::new()
        .route("/recovery/generation-delivery-path/v1/check", post(check).options(preflight));
    if handover {
        router = router.route(
            "/recovery/generation-handover-delivery-path/v1/check",
            post(check_handover).options(preflight),
        );
    }
    router.with_state(state)
}
async fn preflight(Extract(weak): Extract<Weak<State>>, headers: HeaderMap) -> Response {
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(origin) = headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .filter(|origin| state.current.state.current.state.operators.origin(origin))
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
async fn read(state: Arc<State>, body: Bytes, handover: bool) -> Result<Vec<u8>> {
    state.local()?;
    let held = state.clone();
    let bytes = tokio::task::spawn_blocking(move || {
        held.local()?;
        if handover {
            let selected = held.handover.as_ref().ok_or(Error::NeedsRecovery)?;
            if serde_json::to_vec(&selected.selection)?.as_slice() != body.as_ref() {
                return Err(Error::Contract("delivery handover operator selection differs"));
            }
            return selected.receipt(MAX_BYTES);
        }
        let selected: ServerLogGenerationDeliveryPathRecoveryControlIdentity =
            serde_json::from_slice(&body)?;
        if selected != held.selection {
            return Err(Error::Contract(
                "delivery path operator previous/current selection differs",
            ));
        }
        let bytes = serde_json::to_vec(&Read {
            format: "breditor/server-log-generation-delivery-path-recovery-control-read",
            format_version: 1,
            selection: &held.selection,
            scope: "complete-ordered-native-server-path-and-current-provider",
        })?;
        if bytes.len() > MAX_BYTES {
            return Err(Error::Contract("delivery path operator response budget"));
        }
        Ok::<_, Error>(bytes)
    })
    .await
    .map_err(|_| Error::NeedsRecovery)??;
    // This proof already brackets provider callbacks with full path checks.
    state.check(handover).await?;
    Ok(bytes)
}
pub(super) async fn check(Extract(weak): Extract<Weak<State>>, request: Request) -> Response {
    check_request(weak, request, false).await
}
async fn check_handover(Extract(weak): Extract<Weak<State>>, request: Request) -> Response {
    check_request(weak, request, true).await
}
async fn check_request(weak: Weak<State>, request: Request, handover: bool) -> Response {
    let (parts, body) = request.into_parts();
    let headers = parts.headers;
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Some(origin) = headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .filter(|origin| state.current.state.current.state.operators.origin(origin))
        .map(str::to_owned)
    else {
        return StatusCode::FORBIDDEN.into_response();
    };
    if let Err(error) = http::account_for(&state.current.state.current.state.operators, &headers) {
        return http::cors(http::failure(&error), &origin);
    }
    if headers
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .and_then(|text| text.split(';').next())
        != Some("application/json")
    {
        return http::cors(
            http::failure(&Error::Contract("delivery path operator request content type")),
            &origin,
        );
    }
    let Ok(permit) = state.current.state.current.state.requests.clone().try_acquire_owned() else {
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
        match crate::server::generation_recovery::control_work::run(
            permit,
            read(state, body, handover),
        )
        .await
        {
            Ok(bytes) => ([("content-type", "application/json")], bytes).into_response(),
            Err(error) => http::failure(&error),
        },
        &origin,
    )
}
