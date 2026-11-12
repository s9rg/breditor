//! Apply one joined recovery under the same log, raster and operational custody.
use super::{
    OperationalLogGenerationServerRoom, inspect_pending_raster::CommittedPendingRasterCapture,
};
use crate::{
    Error, Result, ServerLogGenerationRoomBackup, log::generations::NativeTailRepairInterruption,
};

impl OperationalLogGenerationServerRoom {
    pub(crate) fn repair_native_prefix_and_raster(
        &mut self,
        original: &ServerLogGenerationRoomBackup,
        captured: &CommittedPendingRasterCapture,
        principal: &str,
        interruption: NativeTailRepairInterruption,
    ) -> Result<()> {
        let recovered = &mut self.recovered;
        if !self.context.guard(&recovered.custody.directory)? {
            return Err(Error::Contract("combined recovery operational marker changed"));
        }
        recovered.custody.check_source_with(
            (&mut recovered.room, &mut recovered.assets),
            original,
            &self.context.extra,
            |room, assets| {
                assets.check_pending_upload_backup(captured.backup.rasters(), &captured.upload)?;
                // The opening log guards its exact inode and change stamp through truncation.
                room.log.complete_inspected_generation_prefix(
                    captured.suffix.len() as u64,
                    interruption,
                )
            },
        )?;
        self.retire_pending_raster(original, captured, principal)
    }
}
