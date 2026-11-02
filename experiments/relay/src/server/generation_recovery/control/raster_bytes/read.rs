//! Bounded byte copies retain genuine source/provider custody through final validation.
use super::request::{MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, Request};
use crate::{
    Error, Result,
    assets::AssetInfo,
    server::{
        backup::check_server_asset_provider,
        generation_recovery::{control::lease::State, selected::check_selected},
    },
};
use axum::body::Bytes;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::Serialize;
use std::sync::Arc;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Raster {
    info: AssetInfo,
    base64: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Read<'a> {
    format: &'static str,
    format_version: u32,
    selection: &'a super::super::ServerLogGenerationRecoveryControlIdentity,
    request_sha256: String,
    scope: &'static str,
    raster: Option<Raster>,
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
        check_server_asset_provider(state.provider.as_ref())?;
        // AssetStore::get validates the complete immutable file and native raster
        // metadata. Missing content is distinct from corrupt known storage.
        let raster = assets
            .get(&request.asset)?
            .map(|stored| Raster { info: stored.info, base64: STANDARD.encode(stored.bytes) });
        let bytes = serde_json::to_vec(&Read {
            format: "breditor/server-log-generation-recovery-raster-read",
            format_version: 1,
            selection: &state.selection,
            request_sha256: digest,
            scope: "selected-server-stored-raster-bytes",
            raster,
        })?;
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(Error::Contract("recovery raster response budget"));
        }
        check_server_asset_provider(state.provider.as_ref())?;
        check(room, &mut assets)?;
        state.local()?;
        Ok(bytes)
    })
    .await
}
pub(in super::super) async fn read(state: Arc<State>, body: Bytes) -> Result<Vec<u8>> {
    state.local()?;
    if body.len() > MAX_REQUEST_BYTES {
        return Err(Error::Contract("recovery raster request budget"));
    }
    let request: Request = serde_json::from_slice(&body)?;
    request.validate(&state.selection)?;
    let digest = crate::assets::asset_id(&body)
        .strip_prefix("sha256:")
        .ok_or(Error::Contract("recovery raster request digest"))?
        .to_owned();
    state.check().await?;
    let bytes = capture(state.clone(), request, digest).await?;
    // The response owns a detached copy. No serialized result becomes a lease;
    // current complete native/provider validity still brackets its publication.
    state.check().await?;
    state.local()?;
    Ok(bytes)
}
