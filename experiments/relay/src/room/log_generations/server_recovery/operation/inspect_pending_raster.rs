//! Read the complete joined state and a detached copy of its interrupted raster upload.
use super::{OperationalLogGenerationServerRoom, resume::OpenMode};
use crate::{
    Error, Result, RoomRecoveryPolicy, ServerLogGenerationParticipantInventory,
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    assets::PendingRasterUpload,
};
use std::path::Path;

pub(crate) struct CommittedPendingRasterCapture {
    pub(crate) backup: ServerLogGenerationRoomBackup,
    pub(crate) participants: ServerLogGenerationParticipantInventory,
    pub(crate) upload: PendingRasterUpload,
    pub(crate) operation: [u8; 32],
}

impl OperationalLogGenerationServerRoom {
    pub(crate) fn with_committed_pending_raster<T>(
        operating_directory: &Path,
        original: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        minimum: &ServerLogGenerationRoomBackup,
        principal: &str,
        verify: impl FnOnce(&mut Self, CommittedPendingRasterCapture) -> Result<T>,
    ) -> Result<T> {
        let mut operational = Self::open_operational(
            operating_directory,
            original,
            expected,
            RoomRecoveryPolicy::HostReacquired,
            principal,
            OpenMode::InspectPendingRaster,
        )?;
        let recovered = &mut operational.recovered;
        let context = &operational.context;
        let capture = recovered.custody.check_source_with(
            (&mut recovered.room, &mut recovered.assets),
            original,
            &context.extra,
            |room, assets| {
                let native = room.export_log_generation_backup(principal)?;
                let (rasters, upload) = assets.capture_pending_upload()?;
                let backup = ServerLogGenerationRoomBackup::from_components(native, rasters)?;
                backup.check_archive_ancestor(original)?;
                backup.check_archive_ancestor(minimum)?;
                let participants = room
                    .capture_generation_inventory_at(principal, backup.info()?.identity.native)?;
                Ok(CommittedPendingRasterCapture {
                    backup,
                    participants,
                    upload,
                    operation: context.activation_owner_digest()?,
                })
            },
        )?;
        if !context.guard(&recovered.custody.directory)? {
            return Err(Error::Contract(
                "generation operational marker changed during raster recovery",
            ));
        }
        let result = verify(&mut operational, capture)?;
        if !operational.context.guard(&operational.recovered.custody.directory)? {
            return Err(Error::Contract(
                "generation operational marker changed during raster recovery",
            ));
        }
        Ok(result)
    }
}
