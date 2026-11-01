//! Actual complete physical Native server dependencies. Offline client sources
//! remain untouched; returned DATA grants no acknowledgement or activation.
use super::PhysicalRoomRecoveryControlIdentity;
use crate::server::generation_recovery::native_dependencies::{
    self as dependency_contract, Read, Request,
};
use crate::{
    Error, Result,
    server::generation_recovery::physical::{control::lease::State, selected::check_selected},
};
use axum::body::Bytes;
use std::sync::Arc;

pub(super) const MAX_REQUEST_BYTES: usize = dependency_contract::MAX_REQUEST_BYTES;

async fn capture(state: Arc<State>, digest: String) -> Result<Vec<u8>> {
    let assets = state.host.local.host.assets.clone().ok_or(Error::NeedsRecovery)?;
    let custody = state.host.local.host.generation_custody.clone().ok_or(Error::NeedsRecovery)?;
    let host = state.host.local.host.clone();
    host.transaction(move |room| {
        state.local()?;
        let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
        let check = |room: &mut crate::Room, assets: &mut crate::assets::AssetStore| {
            check_selected(
                room,
                assets,
                &state.host.local.original,
                &state.host.ancestor,
                &custody,
                &state.owner,
                &state.selection.source,
            )
        };
        check(room, &mut assets)?;
        let inventory = room.log_generation_participant_inventory(&state.owner)?;
        if inventory.identity() != state.selection.source.participants {
            return Err(Error::Contract("native dependency inventory selection"));
        }
        let native = room.log_generation_retained_asset_references(&state.owner)?;
        if native.source != state.selection.source.server.native {
            return Err(Error::Contract("native dependency physical source differs"));
        }
        let bytes = serde_json::to_vec(&Read {
            format: "breditor/physical-room-recovery-native-dependencies-read",
            format_version: 1,
            selection: state.selection.clone(),
            request_sha256: digest,
            scope: dependency_contract::SCOPE,
            native,
        })?;
        if bytes.len() > dependency_contract::MAX_RESPONSE_BYTES {
            return Err(Error::Contract("native dependency complete response budget"));
        }
        check(room, &mut assets)?;
        state.local()?;
        Ok(bytes)
    })
    .await
}

pub(super) async fn read(state: Arc<State>, body: Bytes) -> Result<Vec<u8>> {
    state.local()?;
    let request: Request<PhysicalRoomRecoveryControlIdentity> = serde_json::from_slice(&body)?;
    request.validate(
        &state.selection,
        "breditor/physical-room-recovery-native-dependencies-request",
    )?;
    let digest = crate::assets::asset_id(&body)
        .strip_prefix("sha256:")
        .ok_or(Error::Contract("native dependency request digest"))?
        .to_owned();
    state.check().await?;
    let bytes = capture(state.clone(), digest).await?;
    // A provider callback can change only metadata while leaving document/review
    // clocks unchanged. Revalidate the complete selected server cut after it.
    state.check().await?;
    state.local()?;
    Ok(bytes)
}
