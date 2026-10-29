//! Bounded exact-Origin operator read; no DTO can substitute for genuine native/provider owners.
use super::{
    ServerLogGenerationRecoveryControlIdentity, accepted_native, asset_requirements, lease::State,
    original_review,
};
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
#[derive(Clone, Copy)]
enum Kind {
    Control,
    Assets,
    AcceptedNative,
    OriginalReview,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    selection: &'a ServerLogGenerationRecoveryControlIdentity,
    scope: &'static str,
}
pub(super) fn router(state: Weak<State>) -> Router {
    Router::new()
        .route("/recovery/generations/v1/check", post(check).options(preflight))
        .route("/recovery/generations/v1/assets/check", post(check_assets).options(preflight))
        .route("/recovery/generations/v1/accepted/read", post(accepted).options(preflight))
        .route(
            "/recovery/generations/v1/review/authorizations/read",
            post(original_review_authorizations).options(preflight),
        )
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
    let selection: ServerLogGenerationRecoveryControlIdentity = serde_json::from_slice(&body)?;
    if selection != state.selection {
        return Err(Error::Contract(
            "operator selected control instance or generation source differs",
        ));
    }
    state.check().await?;
    let held = state.clone();
    let bytes = tokio::task::spawn_blocking(move || {
        held.local()?;
        let read = Read {
            format: "breditor/server-log-generation-recovery-control-read",
            format_version: 1,
            selection: &held.selection,
            scope: "native-server-generation-and-server-provider",
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
pub(super) async fn check(Extract(weak): Extract<Weak<State>>, request: Request) -> Response {
    respond(weak, request, Kind::Control).await
}
async fn check_assets(Extract(weak): Extract<Weak<State>>, request: Request) -> Response {
    respond(weak, request, Kind::Assets).await
}
async fn accepted(Extract(weak): Extract<Weak<State>>, request: Request) -> Response {
    respond(weak, request, Kind::AcceptedNative).await
}
async fn original_review_authorizations(
    Extract(weak): Extract<Weak<State>>,
    request: Request,
) -> Response {
    respond(weak, request, Kind::OriginalReview).await
}
async fn respond(weak: Weak<State>, request: Request, kind: Kind) -> Response {
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
    // An authenticated socket owns only its independent request permit while waiting for
    // bytes, not native/provider custody. Actual native workers retain State only after
    // complete admission below. Dropping the controller can therefore release an idle host.
    drop(state);
    let limit = match kind {
        Kind::Control => REQUEST_BYTES,
        Kind::Assets => asset_requirements::MAX_BYTES,
        Kind::AcceptedNative => accepted_native::MAX_REQUEST_BYTES,
        Kind::OriginalReview => original_review::MAX_REQUEST_BYTES,
    };
    let Ok(body) = to_bytes(body, limit).await else {
        return http::cors(StatusCode::PAYLOAD_TOO_LARGE.into_response(), &origin);
    };
    let Some(state) = weak.upgrade().filter(|state| state.local().is_ok()) else {
        return http::cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), &origin);
    };
    let result = crate::server::generation_recovery::control_work::run(permit, async move {
        match kind {
            Kind::Control => read(state, body).await,
            Kind::Assets => asset_requirements::read(state, body).await,
            Kind::AcceptedNative => accepted_native::read(state, body).await,
            Kind::OriginalReview => original_review::read(state, body).await,
        }
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
