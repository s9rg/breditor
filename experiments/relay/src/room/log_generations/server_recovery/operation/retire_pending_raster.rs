//! Retire the exact inspected alias and recheck the original room and all admitted bytes.
use super::{
    OperationalLogGenerationServerRoom, inspect_pending_raster::CommittedPendingRasterCapture,
};
use crate::{Result, ServerLogGenerationRoomBackup};

impl OperationalLogGenerationServerRoom {
    pub(crate) fn retire_pending_raster(
        &mut self,
        original: &ServerLogGenerationRoomBackup,
        captured: &CommittedPendingRasterCapture,
        principal: &str,
    ) -> Result<()> {
        let (room, assets) = self.components_mut();
        captured.backup.native().check_live(room, principal)?;
        assets.check_pending_upload_backup(captured.backup.rasters(), &captured.upload)?;
        assets.retire_pending_upload(&captured.upload)?;
        captured.backup.check_live(room, assets, principal)?;
        self.check_live_source(original, principal)
    }
}
