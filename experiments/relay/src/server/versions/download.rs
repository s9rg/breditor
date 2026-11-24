//! Fetch original exact immutable packet bytes; digest identity never bypasses reader authorization.
use super::{
    HeaderMap, Host, IntoResponse, Response, StatusCode, account, binding, bound, cors, failure,
    origin, retained_body,
};
use axum::extract::{Path, State};
pub(in crate::server) async fn download(
    State(host): State<Host>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Some(allowed) = origin(&host, &headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let principal = match account(&host, &headers) {
        Ok(p) => p,
        Err(e) => return cors(failure(&e), allowed),
    };
    let binding = match binding(&headers) {
        Ok(b) => b,
        Err(e) => return cors(failure(&e), allowed),
    };
    let Ok(permit) = host.version_operations.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    let result = host
        .transaction(move |room| {
            let descriptor = bound(room, &principal, &binding)?;
            Ok((descriptor.binding, room.document_version_packet(&principal, &id)?, permit))
        })
        .await;
    let response = match result {
        Ok((binding, Some(packet), permit)) => {
            let mut response = (
                [
                    ("content-type", "application/json"),
                    ("access-control-expose-headers", "X-Breditor-Catalog"),
                ],
                retained_body(packet.into_bytes(), permit),
            )
                .into_response();
            if let Ok(value) = binding.parse() {
                response.headers_mut().insert("x-breditor-catalog", value);
            }
            response
        }
        Ok((_, None, _permit)) => StatusCode::NOT_FOUND.into_response(),
        Err(error) => failure(&error),
    };
    cors(response, allowed)
}
