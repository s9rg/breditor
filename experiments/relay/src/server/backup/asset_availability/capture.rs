//! Complete native source and file capture at one owner-authenticated server transaction.
use super::super::{ServerBackupHandle, ServerRecoveryStateIdentity};
use super::ServerAssetRecoveryState;
use crate::{Error, Result, Room, ServerRoomBackup, assets::AssetStore};
pub(super) fn state(
    room: &mut Room,
    assets: &mut AssetStore,
    owner: &str,
) -> Result<ServerAssetRecoveryState> {
    let participants = room.participant_inventory(owner)?;
    let server = ServerRoomBackup::capture(room, assets)?.info().identity;
    let references = room.retained_asset_references(owner)?;
    if references.room != server.room || participants.identity().room != server.room {
        return Err(Error::Contract("server asset capture native cuts differ"));
    }
    let value = ServerAssetRecoveryState {
        format: "breditor/server-asset-recovery-state",
        format_version: 1,
        current: ServerRecoveryStateIdentity { server, participants: participants.identity() },
        references,
    };
    super::read_budget::check(&value)?;
    Ok(value)
}
impl ServerBackupHandle {
    /// Capture the complete current log/raster/inventory and native server dependency read together.
    /// No file, role, lease, upload, packet decision or client owner is changed or started.
    /// # Errors
    /// Rejects wrong current owner authentication, uncertain storage, native dependency/decoding
    /// failure and original or separate whole-read bounds. Missing packet source stays Pending.
    pub async fn capture_asset_recovery_state(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<ServerAssetRecoveryState> {
        self.host.authentication.authenticate(principal, token)?;
        let assets =
            self.host.assets.clone().ok_or(Error::Contract("server recovery assets absent"))?;
        let owner = principal.to_owned();
        self.host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                state(room, &mut assets, &owner)
            })
            .await
    }
}
