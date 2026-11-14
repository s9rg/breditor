//! Full native/raster/registration capture while preserving all three source selections.
use super::super::capture::capture_state as capture_local_state;
use super::{PhysicalServerRoomRecoveryState, PreparedPhysicalRoomRecoveryHost};
use crate::{Error, Result, Room, ServerLogGenerationRoomBackup, assets::AssetStore};

pub(super) fn capture_state(
    room: &mut Room,
    assets: &mut AssetStore,
    original: &crate::room::HostOrigin,
    ancestor: &ServerLogGenerationRoomBackup,
    custody: &crate::room::GenerationOperationCustody,
    owner: &str,
) -> Result<PhysicalServerRoomRecoveryState> {
    ancestor.check_retained(room, assets, owner)?;
    let selected = capture_local_state(room, assets, original, custody, owner)?;
    ancestor.check_retained(room, assets, owner)?;
    custody.check_source(room, assets, original, owner)?;
    Ok(PhysicalServerRoomRecoveryState {
        ancestor: ancestor.info()?.identity,
        local_origin: selected.origin,
        server: selected.server,
        participants: selected.participants,
    })
}

impl PreparedPhysicalRoomRecoveryHost {
    /// Authenticate again and capture actual ancestor/local-origin/current pins under one
    /// native room-then-raster transaction. No connection, grant, provider or activation changes.
    /// # Errors
    /// Wrong current authentication/non-owner, lost ancestor/native/raster retention,
    /// changed local operational custody, uncertain storage or existing archive bounds refuse.
    pub async fn capture_recovery_state(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<PhysicalServerRoomRecoveryState> {
        self.local.host.authentication.authenticate(principal, token)?;
        let owner = principal.to_owned();
        let original = self.local.original.clone();
        let ancestor = self.ancestor.clone();
        let custody = self
            .local
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("physical host actual local custody absent"))?;
        let assets = self
            .local
            .host
            .assets
            .clone()
            .ok_or(Error::Contract("physical host actual rasters absent"))?;
        self.local
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                capture_state(room, &mut assets, &original, &ancestor, &custody, &owner)
            })
            .await
    }
}
