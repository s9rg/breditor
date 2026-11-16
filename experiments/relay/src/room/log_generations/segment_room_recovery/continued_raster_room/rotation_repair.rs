//! Hold the original continued room while selecting or completing its exact pending rotation.
use super::{
    ContinuedRasterRoomBackupFiles, RecoveredContinuedRasterRoom,
    RecoveredContinuedRasterRoomIdentity, restore::ReplayMode,
};
use crate::{
    Error, Result, RoomBackupIdentity,
    assets::{AssetBackupIdentity, PendingRasterUpload},
    log::generations::{PendingNativeLogRotation, SelectedSegmentRotation},
};
use std::path::Path;

impl ContinuedRasterRoomBackupFiles {
    pub(crate) fn open_rotation_repair(
        &self,
        path: &Path,
        selected: &RecoveredContinuedRasterRoomIdentity,
        floor: &RoomBackupIdentity,
    ) -> Result<RecoveredContinuedRasterRoom> {
        let (target, recovery) =
            self.open_replayed(path, selected, ReplayMode::PendingRaster(floor))?;
        if recovery.truncated_bytes != 0 {
            return Err(Error::Contract("continued rotation recovery requires a complete WAL"));
        }
        Ok(target)
    }
}

impl RecoveredContinuedRasterRoom {
    pub(crate) fn inspect_native_rotation(
        &self,
    ) -> Result<Option<(SelectedSegmentRotation, PendingNativeLogRotation)>> {
        self.directory.guard()?;
        super::restore::check_completion(&self.directory, &self.identity)?;
        self.room.log.inspect_segment_rotation()
    }

    pub(crate) fn rotation_raster_cut(
        &self,
        stage: Option<&PendingRasterUpload>,
    ) -> Result<AssetBackupIdentity> {
        self.assets.active_identity_with_pending(stage)
    }

    pub(crate) fn preserve_rotation_evidence(
        &self,
        destination: &Path,
        rotation: &PendingNativeLogRotation,
        raster: Option<&PendingRasterUpload>,
    ) -> Result<()> {
        let mut files = vec![("rotation.json", rotation.evidence_bytes())];
        if let Some(raster) = raster {
            files.push(("raster.bin", raster.evidence_bytes()));
        }
        self.preserve_recovery_evidence(destination, &files)
    }

    pub(crate) fn finish_rotation_repair(
        &mut self,
        selected: &SelectedSegmentRotation,
        observed: Option<&PendingNativeLogRotation>,
        raster_cut: &AssetBackupIdentity,
        stage: Option<&PendingRasterUpload>,
        sync_upload: bool,
    ) -> Result<()> {
        if let Some(observed) = observed {
            self.room.log.complete_inspected_pending_rotation(observed.evidence_sha256)?;
        }
        self.room.log.sync_selected_segment_rotation(selected)?;
        if self.rotation_raster_cut(stage)? != *raster_cut {
            return Err(Error::Contract("continued rotation raster cut differs"));
        }
        if sync_upload {
            self.assets.finish_pending_upload(stage)?;
        }
        if self.rotation_raster_cut(None)? != *raster_cut {
            return Err(Error::Contract("continued rotation readback differs"));
        }
        self.directory.guard()?;
        super::restore::check_completion(&self.directory, &self.identity)
    }
}
