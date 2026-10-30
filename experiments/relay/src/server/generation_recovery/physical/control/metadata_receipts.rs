//! Owner/source-bound original metadata pages. Provider callbacks and request
//! cancellation never replace current native custody with serialized receipts.
use super::PhysicalRoomRecoveryControlIdentity;
use crate::server::generation_recovery::metadata_page::{self, Read, Request};
use crate::{
    Error, Result,
    server::generation_recovery::physical::{control::lease::State, selected::check_selected},
};
use axum::body::Bytes;
use std::sync::Arc;

pub(super) const MAX_REQUEST_BYTES: usize = metadata_page::MAX_REQUEST_BYTES;

async fn capture(
    state: Arc<State>,
    request: Arc<Request<PhysicalRoomRecoveryControlIdentity>>,
    digest: String,
) -> Result<Vec<u8>> {
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
            return Err(Error::Contract("metadata page inventory selection"));
        }
        let metadata = room.recovery_metadata_page(&state.owner, &request.metadata)?;
        let bytes = serde_json::to_vec(&Read {
            format: "breditor/physical-room-recovery-metadata-read",
            format_version: 1,
            selection: state.selection.clone(),
            request_sha256: digest,
            scope: metadata_page::SCOPE,
            metadata,
        })?;
        if bytes.len() > metadata_page::MAX_RESPONSE_BYTES {
            return Err(Error::Contract("metadata page complete response budget"));
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
    request.validate(&state.selection, "breditor/physical-room-recovery-metadata-request")?;
    let digest = crate::assets::asset_id(&body)
        .strip_prefix("sha256:")
        .ok_or(Error::Contract("metadata page request digest"))?
        .to_owned();
    state.check().await?;
    let bytes = capture(state.clone(), Arc::new(request), digest).await?;
    // A provider callback can change only metadata while leaving document/review
    // clocks unchanged. Revalidate the complete selected server cut after it.
    state.check().await?;
    state.local()?;
    Ok(bytes)
}
