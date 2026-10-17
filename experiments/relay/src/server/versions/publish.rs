//! Receive raw bounded semantic JSON; serialized Room admission rechecks live authority before fsync.
use super::{
    Error, Host, IntoResponse, Response, StatusCode, account, binding, body, bound, cors, failure,
    origin,
};
use axum::extract::{Request, State};
use serde_json::json;
pub(in crate::server) async fn publish(State(host): State<Host>, request: Request) -> Response {
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
    let p = principal.clone();
    let b = binding.clone();
    if let Err(error) = host
        .transaction(move |room| {
            bound(room, &p, &b)?;
            room.editor(&p)
        })
        .await
    {
        return cors(failure(&error), allowed);
    }
    let Ok(_permit) = host.version_operations.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    if parts.headers.get("content-type").and_then(|h| h.to_str().ok()) != Some("application/json") {
        return cors(failure(&Error::Contract("version packet content type")), allowed);
    }
    let bytes = match body(bytes, 4 * 1024 * 1024).await {
        Ok(bytes) => bytes,
        Err(status) => return cors(status.into_response(), allowed),
    };
    let Ok(packet) = String::from_utf8(bytes) else {
        return cors(failure(&Error::Contract("version packet encoding")), allowed);
    };
    let result=host.transaction(move|room|{let descriptor=bound(room,&principal,&binding)?;let admission=room.publish_document_version(&principal,&packet)?;let changed=matches!(&admission,crate::DocumentVersionAdmission::Durable(receipt)if !receipt.duplicate);Ok((json!({"format":"breditor/relay-document-version-admission","formatVersion":1,"descriptor":descriptor,"admission":admission}),changed))}).await;
    let response = match result {
        Ok((value, changed)) => {
            if changed {
                host.notify_document_versions();
            }
            super::json(value)
        }
        Err(error) => failure(&error),
    };
    cors(response, allowed)
}
