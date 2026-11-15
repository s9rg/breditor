//! Authorize before receiving the body and verify retained native provenance at the append cut.
use super::{
    Access, CONTENT_TYPE, Host, cors, decode_sha256, entry_response, failure, header, origin,
};
use crate::{Error, room::recovered_discussion::MAX_DISCUSSION_BYTES, server::versions::body};
use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};

pub(in crate::server) async fn publish(
    State(host): State<Host>,
    Path(id): Path<(String, String)>,
    request: Request,
) -> Response {
    let (parts, stream) = request.into_parts();
    let Some(allowed) = origin(&host, &parts.headers) else {
        return StatusCode::FORBIDDEN.into_response();
    };
    let response = async {
        let access = Access::read(&host, &parts.headers, id)?;
        let archive = decode_sha256(header(&parts.headers, "x-breditor-archive")?)?;
        if header(&parts.headers, "content-type")? != CONTENT_TYPE {
            return Err(Error::Contract("recovered discussion content type"));
        }
        let Ok(_permit) = host.discussion_operations.clone().try_acquire_owned() else {
            return Ok(StatusCode::SERVICE_UNAVAILABLE.into_response());
        };
        let principal = access.principal.clone();
        let binding = access.binding.clone();
        host.transaction(move |room| {
            room.recovery_inventory_owner(&principal)?;
            room.check_discussion_catalog(&principal, &binding)
        })
        .await?;
        let bytes = match body(stream, MAX_DISCUSSION_BYTES).await {
            Ok(bytes) => bytes,
            Err(status) => return Ok(status.into_response()),
        };
        let packet = String::from_utf8(bytes)
            .map_err(|_| Error::Contract("recovered discussion encoding"))?;
        let custody = host.relay_segment_custody.clone();
        let entry = host
            .transaction(move |room| {
                room.check_discussion_catalog(&access.principal, &access.binding)?;
                room.publish_recovered_discussion(
                    &access.principal,
                    &access.thread,
                    archive,
                    packet,
                    |room, record| {
                        let custody = custody.as_ref().ok_or(Error::Contract(
                            "recovered discussion publication requires retained custody",
                        ))?;
                        custody.verify_recovered_discussion(
                            room,
                            &access.principal,
                            archive,
                            record,
                        )
                    },
                )
            })
            .await?;
        Ok(entry_response(entry))
    }
    .await;
    cors(response.unwrap_or_else(|error| failure(&error)), allowed)
}
