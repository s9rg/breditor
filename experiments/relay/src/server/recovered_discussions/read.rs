//! Discover a pin or download exact accepted bytes under current room-read authorization.
use super::{Access, CONTENT_TYPE, ENTRY_CONTENT_TYPE, Host, cors, entry_bytes, failure, origin};
use crate::{Result, Room, server::http::retained_body};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};

pub(in crate::server) async fn discover(
    State(host): State<Host>,
    Path(id): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    read(host, id, headers, ENTRY_CONTENT_TYPE, |room, access| {
        room.recovered_discussion(&access.principal, &access.binding, &access.thread)?
            .map(entry_bytes)
            .transpose()
    })
    .await
}

pub(in crate::server) async fn download(
    State(host): State<Host>,
    Path(id): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    read(host, id, headers, CONTENT_TYPE, |room, access| {
        Ok(room
            .recovered_discussion_packet(&access.principal, &access.binding, &access.thread)?
            .map(String::into_bytes))
    })
    .await
}

async fn read(
    host: Host,
    id: (String, String),
    headers: HeaderMap,
    content_type: &'static str,
    handler: impl FnOnce(&Room, Access) -> Result<Option<Vec<u8>>> + Send + 'static,
) -> Response {
    let Some(allowed) = origin(&host, &headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let access = match Access::read(&host, &headers, id) {
        Ok(access) => access,
        Err(error) => return cors(failure(&error), allowed),
    };
    let Ok(permit) = host.discussion_operations.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    let result = host.transaction(move |room| Ok((handler(room, access)?, permit))).await;
    let response = match result {
        Ok((Some(bytes), permit)) => {
            ([("content-type", content_type)], retained_body(bytes, permit)).into_response()
        }
        Ok((None, _permit)) => StatusCode::NOT_FOUND.into_response(),
        Err(error) => failure(&error),
    };
    cors(response, allowed)
}

#[cfg(test)]
mod tests;
