//! Closed bounded frozen-interval catalog read; authorization is repeated after body admission.
use super::{
    Error, Host, IntoResponse, Response, StatusCode, account, binding, body, bound, cors, failure,
    origin,
};
use axum::extract::{Request, State};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PageRequest {
    cursor: Option<crate::DocumentVersionsCursor>,
}
pub(in crate::server) async fn list(State(host): State<Host>, request: Request) -> Response {
    let (parts, bytes) = request.into_parts();
    let Some(allowed) = origin(&host, &parts.headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let principal = match account(&host, &parts.headers) {
        Ok(p) => p,
        Err(e) => return cors(failure(&e), allowed),
    };
    let binding = match binding(&parts.headers) {
        Ok(b) => b,
        Err(e) => return cors(failure(&e), allowed),
    };
    let Ok(permit) = host.version_operations.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    let p = principal.clone();
    let b = binding.clone();
    let permit = match host.transaction(move |room| bound(room, &p, &b).map(|_| permit)).await {
        Ok(permit) => permit,
        Err(error) => return cors(failure(&error), allowed),
    };
    if parts.headers.get("content-type").and_then(|h| h.to_str().ok()) != Some("application/json") {
        return cors(failure(&Error::Contract("version catalog content type")), allowed);
    }
    let bytes = match body(bytes, 4096).await {
        Ok(bytes) => bytes,
        Err(status) => return cors(status.into_response(), allowed),
    };
    let page: PageRequest = match serde_json::from_slice(&bytes) {
        Ok(page) => page,
        Err(_) => return cors(failure(&Error::Contract("version catalog page request")), allowed),
    };
    let result = host
        .transaction(move |room| {
            bound(room, &principal, &binding)?;
            let page = room.document_versions_page(&principal, page.cursor.as_ref())?;
            let bytes = serde_json::to_vec(&serde_json::to_value(page)?)?;
            Ok((bytes, permit))
        })
        .await;
    cors(
        result.map_or_else(|error| failure(&error), |(bytes, permit)| super::json(bytes, permit)),
        allowed,
    )
}
