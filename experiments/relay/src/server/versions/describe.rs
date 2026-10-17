//! Explicit catalog discovery under fresh account/read permission; no persisted live role.
use super::{HeaderMap, Host, IntoResponse, Response, StatusCode, account, cors, failure, origin};
use axum::extract::State;
use serde_json::json;
pub(in crate::server) async fn describe(State(host): State<Host>, headers: HeaderMap) -> Response {
    let Some(allowed) = origin(&host, &headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let principal = match account(&host, &headers) {
        Ok(principal) => principal,
        Err(error) => return cors(failure(&error), allowed),
    };
    let result=host.transaction(move|room|Ok(json!({"format":"breditor/relay-document-versions-info","formatVersion":1,"descriptor":room.document_versions_descriptor(&principal)?,"canPublish":room.document_versions_can_publish(&principal)?}))).await;
    cors(result.map_or_else(|error| failure(&error), super::json), allowed)
}
