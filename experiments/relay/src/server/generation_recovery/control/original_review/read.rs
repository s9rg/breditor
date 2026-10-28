//! Current genuine native/provider custody authenticates first acceptance, not an incoming role DTO.
use super::super::{ServerLogGenerationRecoveryControlIdentity, lease::State};
use super::request::{MAX_RESPONSE_BYTES, Request};
use crate::server::generation_recovery::selected::check_selected;
use crate::{Error, Result, ReviewOriginalAuthorizationRead};
use axum::body::Bytes;
use serde::Serialize;
use std::sync::Arc;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read {
    format: &'static str,
    format_version: u32,
    selection: ServerLogGenerationRecoveryControlIdentity,
    request_sha256: String,
    scope: &'static str,
    authorizations: ReviewOriginalAuthorizationRead,
}
async fn capture(state: Arc<State>, request: Request, digest: String) -> Result<Vec<u8>> {
    let assets = state.host.host.assets.clone().ok_or(Error::NeedsRecovery)?;
    let custody = state.host.host.generation_custody.clone().ok_or(Error::NeedsRecovery)?;
    let host = state.host.host.clone();
    host.transaction(move |room| {
        state.local()?;
        let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
        let check = |room: &mut crate::Room, assets: &mut crate::assets::AssetStore| {
            check_selected(
                room,
                assets,
                &state.host.original,
                &custody,
                &state.owner,
                &state.selection.source,
            )
        };
        check(room, &mut assets)?;
        let authorizations =
            room.review_original_authorizations(&state.owner, &request.binding, &request.ranges)?;
        let read = Read {
            format: "breditor/server-log-generation-review-original-authorizations-read",
            format_version: 1,
            selection: state.selection.clone(),
            request_sha256: digest,
            scope: "selected-server-original-review-acceptance",
            authorizations,
        };
        let bytes = serde_json::to_vec(&read)?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(Error::Contract("original review authority complete response budget"));
        }
        check(room, &mut assets)?;
        state.local()?;
        Ok(bytes)
    })
    .await
}
pub(in crate::server) async fn read(state: Arc<State>, body: Bytes) -> Result<Vec<u8>> {
    state.local()?;
    let request: Request = serde_json::from_slice(&body)?;
    request.validate(&state.selection)?;
    let digest = crate::assets::asset_id(&body)
        .strip_prefix("sha256:")
        .ok_or(Error::Contract("original review authority request digest"))?
        .to_owned();
    state.check().await?;
    let bytes = capture(state.clone(), request, digest).await?;
    // The final provider callback can change a native source; no cached cut may publish success.
    state.check().await?;
    state.local()?;
    Ok(bytes)
}
