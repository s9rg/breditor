//! Inspect and retire one pending image under the same room, raster and native WAL ownership.
use super::{
    ContinuedRasterRoomBackupFiles, RecoveredContinuedRasterRoom,
    RecoveredContinuedRasterRoomIdentity, restore::ReplayMode,
};
use crate::{
    Error, Result, RoomBackupIdentity,
    assets::{AssetBackupIdentity, PendingRasterUpload},
    log::generations::{NativeTailRepairInterruption, SelectedNativeTailPrefix},
};
use std::path::Path;

impl ContinuedRasterRoomBackupFiles {
    pub(crate) fn open_pending_raster_repair(
        &self,
        path: &Path,
        selected: &RecoveredContinuedRasterRoomIdentity,
        floor: &RoomBackupIdentity,
    ) -> Result<RecoveredContinuedRasterRoom> {
        let (mut target, recovery) =
            self.open_replayed(path, selected, ReplayMode::PendingRaster(floor))?;
        if recovery.truncated_bytes == 0 {
            target.room.log.finish_complete_recovery(recovery)?;
        }
        Ok(target)
    }
}

impl RecoveredContinuedRasterRoom {
    pub(crate) fn pending_raster_upload(&self) -> Result<Option<PendingRasterUpload>> {
        self.assets.inspect_pending_upload()
    }

    pub(crate) fn pending_raster_cut(
        &self,
        staged: Option<&PendingRasterUpload>,
    ) -> Result<(SelectedNativeTailPrefix, AssetBackupIdentity)> {
        Ok((self.native_recovery_prefix()?, self.assets.active_identity_with_pending(staged)?))
    }

    pub(crate) fn preserve_pending_raster_evidence(
        &self,
        destination: &Path,
        upload: &PendingRasterUpload,
        suffix: &[u8],
    ) -> Result<()> {
        self.preserve_recovery_evidence(
            destination,
            &[("raster.bin", upload.evidence_bytes()), ("suffix.bin", suffix)],
        )
    }

    pub(crate) fn finish_pending_raster_repair(
        &mut self,
        accepted: &(SelectedNativeTailPrefix, AssetBackupIdentity),
        staged: Option<&PendingRasterUpload>,
        suffix_bytes: u64,
        stop: NativeTailRepairInterruption,
    ) -> Result<()> {
        if self.pending_raster_cut(staged)? != *accepted {
            return Err(Error::Contract("continued upload recovery accepted cut differs"));
        }
        self.room.log.complete_inspected_generation_prefix(suffix_bytes, stop)?;
        if self.pending_raster_cut(staged)? != *accepted {
            return Err(Error::Contract("continued upload recovery log readback differs"));
        }
        self.assets.finish_pending_upload(staged)?;
        if self.native_tail_cut()? != *accepted {
            return Err(Error::Contract("continued upload recovery readback differs"));
        }
        Ok(())
    }
}
