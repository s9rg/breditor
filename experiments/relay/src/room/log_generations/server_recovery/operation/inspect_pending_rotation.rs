//! Hold the original operational custody while inspecting an unfinished physical rotation.
use super::{OperationalLogGenerationServerRoom, resume::OpenMode};
use crate::{
    Error, Result, RoomRecoveryPolicy, ServerLogGenerationParticipantInventory,
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    log::generations::PendingNativeLogRotation,
};
use std::path::Path;

pub(crate) struct CommittedPendingRotationCapture {
    pub(crate) backup: ServerLogGenerationRoomBackup,
    pub(crate) participants: ServerLogGenerationParticipantInventory,
    pub(crate) rotation: PendingNativeLogRotation,
    pub(crate) operation: [u8; 32],
}

impl OperationalLogGenerationServerRoom {
    pub(crate) fn with_committed_pending_rotation<T>(
        operating_directory: &Path,
        original: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        minimum: &ServerLogGenerationRoomBackup,
        principal: &str,
        verify: impl FnOnce(&mut Self, CommittedPendingRotationCapture) -> Result<T>,
    ) -> Result<T> {
        let mut operational = Self::open_operational(
            operating_directory,
            original,
            expected,
            RoomRecoveryPolicy::HostReacquired,
            principal,
            OpenMode::InspectPendingRotation,
        )?;
        let recovered = &mut operational.recovered;
        let context = &operational.context;
        let capture = recovered.custody.check_source_with(
            (&mut recovered.room, &mut recovered.assets),
            original,
            &context.extra,
            |room, assets| {
                let (native, rotation) =
                    room.export_inspected_pending_generation_rotation(principal)?;
                let rasters = assets.export_backup()?;
                assets.check_exported_backup(&rasters)?;
                let backup = ServerLogGenerationRoomBackup::from_components(native, rasters)?;
                backup.check_archive_ancestor(original)?;
                backup.check_archive_ancestor(minimum)?;
                let participants = room
                    .capture_generation_inventory_at(principal, backup.info()?.identity.native)?;
                room.log.recheck_pending_generation_rotation(rotation.evidence_sha256)?;
                Ok(CommittedPendingRotationCapture {
                    backup,
                    participants,
                    rotation,
                    operation: context.activation_owner_digest()?,
                })
            },
        )?;
        if !context.guard(&recovered.custody.directory)? {
            return Err(Error::Contract("generation operational marker changed during inspection"));
        }
        let result = verify(&mut operational, capture)?;
        if !operational.context.guard(&operational.recovered.custody.directory)? {
            return Err(Error::Contract("generation operational marker changed during inspection"));
        }
        Ok(result)
    }

    pub(crate) fn recheck_pending_rotation(&self, evidence: [u8; 32]) -> Result<()> {
        self.room().log.recheck_pending_generation_rotation(evidence)
    }
}
