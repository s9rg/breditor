//! Both actual mutable owners remain borrowed for the entire serialized joined source capture.
use super::ServerLogGenerationRoomBackup;
use crate::{Error, Result, Room, assets::AssetStore};
impl ServerLogGenerationRoomBackup {
    /// Capture complete native history and every retained raster, including unreferenced files.
    /// Requires a current host-authenticated owner and serialized service access to both owners.
    /// Does not flush clients, fetch providers, upload, prune, change roles or append native events.
    /// # Errors
    /// Non-owner calls, original storage, component-binding mismatch, uncertain files or bounds
    /// refuse. Original storage/archive families retain their meanings and ceilings.
    pub fn capture(room: &mut Room, assets: &mut AssetStore, principal: &str) -> Result<Self> {
        room.recovery_inventory_owner(principal)?;
        if room.asset_binding() != assets.binding() {
            return Err(Error::Contract("joined generation asset binding"));
        }
        let native = room.export_log_generation_backup(principal)?;
        let rasters = assets.export_backup()?;
        native.check_live(room, principal)?;
        assets.check_exported_backup(&rasters)?;
        Self::from_components(native, rasters)
    }
}
