//! Write the native cut and matching complete raster store without a whole-room buffer.
use super::{RelaySegmentRoomBackupFiles, RelaySegmentRoomBackupIdentity};
use crate::{
    Error, RelaySegmentBaseFile, Result, Room,
    archive_digest::ArchiveDigest,
    archive_input::ArchiveInput,
    assets::{AssetStore, MAX_SERVER_ASSET_BACKUP_BYTES, admit_asset_file},
    room::log_generations::backup::{BackupOutput, segment_history_digest},
};
use std::{cell::Cell, fs::File, io::Write, sync::Arc};

impl Room {
    /// Stream the current physical log segment, its native checkpoint and exact raster store.
    /// Keep all earlier native archives for a continued room. Retain the returned identity
    /// independently and sync the three destinations before selecting it for recovery.
    ///
    /// # Errors
    /// Non-owner access, different asset binding, uncertain data or output failure refuse.
    /// Discard partial output after an error.
    pub fn write_relay_segment_room_backup(
        &mut self,
        principal: &str,
        assets: &AssetStore,
        archive: &mut impl Write,
        checkpoint: &mut impl Write,
        raster_archive: &mut impl Write,
    ) -> Result<RelaySegmentRoomBackupIdentity> {
        self.recovery_inventory_owner(principal)?;
        if assets.binding() != self.asset_binding() {
            return Err(Error::Contract("relay segment room asset binding differs"));
        }
        // The immutable source is held across destination callbacks and rechecked before success.
        let rasters = assets.prepare_backup_stream()?;
        let failed = Cell::new(false);
        let mut output = BackupOutput {
            destination: raster_archive,
            digest: ArchiveDigest::new(MAX_SERVER_ASSET_BACKUP_BYTES),
            failed: &failed,
        };
        rasters.write_to(&mut output)?;
        output.flush()?;
        if output.digest.finish() != (rasters.identity.archive_sha256, rasters.bytes) {
            return Err(Error::Contract("relay segment room raster output differs"));
        }
        let native = self.write_relay_segment_base(principal, archive, checkpoint)?;
        rasters.check()?;
        let history_sha256 = segment_history_digest(self.log.segment_base(), &native)?;
        Ok(RelaySegmentRoomBackupIdentity { native, history_sha256, assets: rasters.identity })
    }
}

impl RelaySegmentRoomBackupFiles {
    /// Verify all native and raster components against an independently retained whole-room cut.
    ///
    /// # Errors
    /// Refuses changed or incomplete files, incompatible binding, and a wrong native history.
    pub fn open(
        native: Arc<RelaySegmentBaseFile>,
        rasters: File,
        expected: &RelaySegmentRoomBackupIdentity,
    ) -> Result<Self> {
        native.check()?;
        if native.identity() != &expected.native
            || native.binding() != expected.history_sha256
            || native.identity().predecessor.source.asset_binding != expected.assets.binding
        {
            return Err(Error::Contract("relay segment room backup selection differs"));
        }
        let rasters = ArchiveInput::new(rasters, MAX_SERVER_ASSET_BACKUP_BYTES)?;
        let entries = admit_asset_file(rasters.all(), &expected.assets)?;
        let value = Self { identity: expected.clone(), native, rasters, entries };
        value.check()?;
        Ok(value)
    }

    /// Detached selected backup.
    #[must_use]
    pub fn identity(&self) -> &RelaySegmentRoomBackupIdentity {
        &self.identity
    }

    pub(super) fn check(&self) -> Result<()> {
        self.native.check()?;
        self.rasters.check()
    }
}
