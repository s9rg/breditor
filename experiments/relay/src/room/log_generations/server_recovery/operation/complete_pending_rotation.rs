//! Complete a selected rotation and recheck the exact physical change before returning its cut.
use super::{
    OperationalLogGenerationServerRoom, inspect_pending_rotation::CommittedPendingRotationCapture,
};
use crate::{
    Error, Result, ServerLogGenerationBackup, ServerLogGenerationParticipantInventory,
    ServerLogGenerationRoomBackup, log::generations::PendingNativeLogRotation,
};

fn check_rotated_archive(
    before: &ServerLogGenerationBackup,
    after: &ServerLogGenerationBackup,
    rotation: &PendingNativeLogRotation,
) -> Result<()> {
    let before_info = before.info();
    let after_info = after.info();
    if after_info.identity.source != before_info.identity.source
        || after_info.identity.manifest != rotation.after_manifest
    {
        return Err(Error::Contract("completed sealed rotation cut differs"));
    }
    if rotation.head_published {
        if after_info.identity != before_info.identity {
            return Err(Error::Contract("completed sealed rotation changed selected files"));
        }
    } else {
        after.check_archive_ancestor(before)?;
        // Only the intended manifest and empty continuation can join the selected archive.
        if after_info.files != before_info.files + 2 {
            return Err(Error::Contract("completed sealed rotation added unselected files"));
        }
    }
    Ok(())
}

impl OperationalLogGenerationServerRoom {
    pub(crate) fn complete_pending_rotation(
        &mut self,
        original: &ServerLogGenerationRoomBackup,
        captured: CommittedPendingRotationCapture,
        principal: &str,
    ) -> Result<(ServerLogGenerationRoomBackup, ServerLogGenerationParticipantInventory)> {
        let recovered = &mut self.recovered;
        let completed = recovered.custody.check_source_with(
            (&mut recovered.room, &mut recovered.assets),
            original,
            &self.context.extra,
            |room, assets| {
                if let Some(upload) = &captured.upload {
                    assets.check_pending_upload_backup(captured.backup.rasters(), upload)?;
                }
                room.log.complete_inspected_pending_rotation(captured.rotation.evidence_sha256)?;
                let native = room.export_log_generation_backup(principal)?;
                check_rotated_archive(captured.backup.native(), &native, &captured.rotation)?;
                native.check_live(room, principal)?;
                let participants =
                    room.capture_generation_inventory_at(principal, native.info().identity)?;
                if let Some(upload) = &captured.upload {
                    assets.check_pending_upload_backup(captured.backup.rasters(), upload)?;
                    assets.retire_pending_upload(upload)?;
                }
                let rasters = captured.backup.into_rasters();
                assets.check_exported_backup(&rasters)?;
                Ok((ServerLogGenerationRoomBackup::from_components(native, rasters)?, participants))
            },
        )?;
        self.check_live_source(original, principal)?;
        Ok(completed)
    }
}
