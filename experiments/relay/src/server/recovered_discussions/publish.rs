//! Restore archive provenance off-lock, then recheck live authority and append under the current epoch.
use super::{
    Access, CONTENT_TYPE, Host, cors, decode_sha256, entry_response, failure, header, origin,
};
use crate::{
    Error, Result, Room,
    room::recovered_discussion::{DiscussionEntry, MAX_DISCUSSION_BYTES},
    server::versions::body,
};
use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};

#[cfg(all(test, unix))]
mod tests;

enum Admission<T> {
    Duplicate(DiscussionEntry),
    Verify(T),
}

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
        let Ok(permit) = host.discussion_publications.clone().try_acquire_owned() else {
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
        let principal = access.principal.clone();
        let binding = access.binding.clone();
        let thread = access.thread.clone();
        let (admission, permit) = host
            .transaction(move |room| {
                room.check_discussion_catalog(&principal, &binding)?;
                if let Some(entry) = room
                    .check_recovered_discussion_publication(&principal, &thread, archive, &packet)?
                {
                    return Ok((Admission::Duplicate(entry), permit));
                }
                Ok((
                    Admission::Verify((room.recovered_discussion_source(&principal)?, packet)),
                    permit,
                ))
            })
            .await?;
        let (source, packet) = match admission {
            Admission::Duplicate(entry) => return Ok(entry_response(entry)),
            Admission::Verify(pending) => pending,
        };
        let custody = host
            .relay_segment_custody
            .clone()
            .ok_or(Error::Contract("recovered discussion publication requires retained custody"))?;
        let entry = verify_then_commit(
            &host,
            permit,
            move || custody.prepare_recovered_discussion(source, archive, packet),
            move |room, verified| {
                room.check_discussion_catalog(&access.principal, &access.binding)?;
                verified.publish(room, &access.principal, &access.thread)
            },
        )
        .await?;
        Ok(entry_response(entry))
    }
    .await;
    cors(response.unwrap_or_else(|error| failure(&error)), allowed)
}

// The real worker owns its quota even if the request future is dropped. The
// second Host transaction obtains fresh epoch and file-custody admission.
async fn verify_then_commit<T: Send + 'static, R: Send + 'static>(
    host: &Host,
    permit: tokio::sync::OwnedSemaphorePermit,
    verify: impl FnOnce() -> Result<T> + Send + 'static,
    commit: impl FnOnce(&mut Room, T) -> Result<R> + Send + 'static,
) -> Result<R> {
    let (verified, permit) =
        tokio::task::spawn_blocking(move || verify().map(|verified| (verified, permit)))
            .await
            .map_err(|_| Error::NeedsRecovery)??;
    let (committed, _permit) =
        host.transaction(move |room| commit(room, verified).map(|entry| (entry, permit))).await?;
    Ok(committed)
}
