//! Match actual still-owned components; a detached archive never proves its own native validity.
use super::ServerLogGenerationRoomBackup;
use crate::{Error, Result, Room, assets::AssetStore};
impl ServerLogGenerationRoomBackup {
    /// Recheck the exact actual native/raster source under current owner access, without another
    /// complete native or raster buffer. This is not provider/client coverage or activation.
    /// # Errors
    /// Wrong source, non-owner access, changed/uncertain storage or component-binding mismatch refuses.
    pub fn check_live(&self, room: &mut Room, assets: &AssetStore, principal: &str) -> Result<()> {
        self.native.check_live(room, principal)?;
        if room.asset_binding() != assets.binding() {
            return Err(Error::Contract("joined actual component binding differs"));
        }
        assets.check_exported_backup(&self.assets)
    }
    /// Verify actual later native history still retains the entire original physical prefix and
    /// every original raster, while admitting complete later events, rotations and immutable
    /// uploads. Does not reset source identity, prune history, reconcile clients or activate.
    /// # Errors
    /// Non-owner access, foreign/forked source, missing original bytes, uncertain storage or native
    /// admission of current rasters refuses. Existing component limits are not widened.
    pub fn check_retained(
        &self,
        room: &mut Room,
        assets: &mut AssetStore,
        principal: &str,
    ) -> Result<()> {
        self.native.check_retained(room, principal)?;
        if room.asset_binding() != assets.binding() {
            return Err(Error::Contract("joined retained component binding differs"));
        }
        assets.verify_retained_backup(&self.assets)?;
        Ok(())
    }
}
