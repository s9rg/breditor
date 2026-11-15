//! Discover a pin or download exact accepted bytes under current room-read authorization.
use super::{Access, CONTENT_TYPE, Host, cors, entry_response, failure, origin};
use crate::{Result, Room};
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
    read(host, id, headers, |room, access| {
        Ok(match room.recovered_discussion(&access.principal, &access.binding, &access.thread)? {
            Some(entry) => entry_response(entry),
            None => StatusCode::NOT_FOUND.into_response(),
        })
    })
    .await
}

pub(in crate::server) async fn download(
    State(host): State<Host>,
    Path(id): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    read(host, id, headers, |room, access| {
        Ok(
            match room.recovered_discussion_packet(
                &access.principal,
                &access.binding,
                &access.thread,
            )? {
                Some(packet) => ([("content-type", CONTENT_TYPE)], packet).into_response(),
                None => StatusCode::NOT_FOUND.into_response(),
            },
        )
    })
    .await
}

async fn read(
    host: Host,
    id: (String, String),
    headers: HeaderMap,
    handler: impl FnOnce(&Room, Access) -> Result<Response> + Send + 'static,
) -> Response {
    let Some(allowed) = origin(&host, &headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let access = match Access::read(&host, &headers, id) {
        Ok(access) => access,
        Err(error) => return cors(failure(&error), allowed),
    };
    let Ok(_permit) = host.discussion_operations.clone().try_acquire_owned() else {
        return cors(StatusCode::SERVICE_UNAVAILABLE.into_response(), allowed);
    };
    let response = host.transaction(move |room| handler(room, access)).await;
    cors(response.unwrap_or_else(|error| failure(&error)), allowed)
}
