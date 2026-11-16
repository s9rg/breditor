//! Hold the replayed native prefix and original room/raster owners while inspecting a torn WAL.
use super::{
    ContinuedRasterRoomBackupFiles, RecoveredContinuedRasterRoom,
    RecoveredContinuedRasterRoomIdentity,
};
use crate::{
    Error, Result, RoomBackupIdentity,
    assets::AssetBackupIdentity,
    log::generations::{NativeTailRepairInterruption, SelectedNativeTailPrefix},
};
use std::path::Path;

impl ContinuedRasterRoomBackupFiles {
    pub(crate) fn open_native_tail(
        &self,
        path: &Path,
        selected: &RecoveredContinuedRasterRoomIdentity,
        floor: &RoomBackupIdentity,
    ) -> Result<RecoveredContinuedRasterRoom> {
        let (mut target, recovery) = self.open_replayed(path, selected, true, Some(floor))?;
        if recovery.truncated_bytes == 0 {
            target.room.log.finish_complete_recovery(recovery)?;
        }
        Ok(target)
    }
}

impl RecoveredContinuedRasterRoom {
    pub(crate) fn native_tail_cut(
        &self,
    ) -> Result<(SelectedNativeTailPrefix, AssetBackupIdentity)> {
        self.directory.guard()?;
        super::restore::check_completion(&self.directory, &self.identity)?;
        let native = self.room.log.select_native_tail_prefix()?;
        let assets = self.assets.active_backup_identity()?;
        Ok((native, assets))
    }

    pub(crate) fn native_incomplete_suffix(&mut self) -> Result<Vec<u8>> {
        if self.room.log.has_incomplete_generation_tail()? {
            self.room.log.read_incomplete_generation_tail()
        } else {
            Ok(Vec::new())
        }
    }

    pub(crate) fn preserve_native_suffix(&self, destination: &Path, suffix: &[u8]) -> Result<()> {
        let evidence = self.directory.create_outside(destination)?;
        let file = evidence.create_file("suffix.bin", suffix)?;
        file.sync_all()?;
        evidence.sync()?;
        evidence.guard()
    }

    pub(crate) fn operating_directory(&self) -> &Path {
        &self.directory.path
    }

    pub(crate) fn finish_native_tail_repair(
        &mut self,
        expected: &(SelectedNativeTailPrefix, AssetBackupIdentity),
        suffix_bytes: u64,
        stop: NativeTailRepairInterruption,
    ) -> Result<()> {
        if self.native_tail_cut()? != *expected {
            return Err(Error::Contract("continued native tail repair cut differs"));
        }
        self.room.log.complete_inspected_generation_prefix(suffix_bytes, stop)?;
        if self.native_tail_cut()? != *expected {
            return Err(Error::Contract("continued native tail repair readback differs"));
        }
        Ok(())
    }
}
