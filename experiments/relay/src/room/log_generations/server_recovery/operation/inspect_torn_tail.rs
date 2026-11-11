//! Export the surviving complete room prefix without repairing the committed operation.
use super::{OperationalLogGenerationServerRoom, resume::OpenMode};
use crate::{
    Result, RoomRecoveryPolicy, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupIdentity,
};
use sha2::{Digest, Sha256};
use std::path::Path;

/// Detached room archive and fingerprint of the incomplete suffix left in the source WAL.
pub struct InspectedNativeGenerationTail {
    /// Semantically replayed complete native history and verified raster bytes.
    pub backup: ServerLogGenerationRoomBackup,
    /// Number of bytes in the incomplete final active frame.
    pub incomplete_bytes: u64,
    /// SHA-256 of those incomplete bytes, which remain in the original file.
    pub incomplete_sha256: [u8; 32],
}

#[cfg(feature = "server")]
pub(crate) struct CommittedNativeTailCapture {
    pub(crate) inspected: InspectedNativeGenerationTail,
    pub(crate) participants: crate::ServerLogGenerationParticipantInventory,
    pub(crate) operation: [u8; 32],
    pub(crate) suffix: Vec<u8>,
}

impl OperationalLogGenerationServerRoom {
    /// Inspect an incomplete final frame in a committed operational room. Supply the
    /// independently retained original source and the latest retained complete room archive.
    /// The surviving prefix must contain both cuts. The caller authenticates the owner.
    ///
    /// All files stay in place. The result grants no writer, deployment or provider authority.
    ///
    /// # Errors
    /// Refuses missing or changed custody, uncommitted handoff, malformed complete frames,
    /// failed native replay, incomplete rotation or raster upload, and missing retained work.
    pub fn inspect_committed_native_tail(
        operating_directory: &Path,
        original: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        minimum: &ServerLogGenerationRoomBackup,
        policy: RoomRecoveryPolicy,
        principal: &str,
    ) -> Result<InspectedNativeGenerationTail> {
        let mut operational = Self::open_operational(
            operating_directory,
            original,
            expected,
            policy,
            principal,
            OpenMode::InspectTornTail,
        )?;
        let (inspected, _) = operational.capture_native_tail(original, minimum, principal)?;
        operational.check_live_source(original, principal)?;
        Ok(inspected)
    }

    #[cfg(feature = "server")]
    pub(crate) fn with_committed_native_tail<T>(
        operating_directory: &Path,
        original: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        minimum: &ServerLogGenerationRoomBackup,
        principal: &str,
        verify: impl FnOnce(CommittedNativeTailCapture) -> Result<T>,
    ) -> Result<T> {
        let mut operational = Self::open_operational(
            operating_directory,
            original,
            expected,
            RoomRecoveryPolicy::HostReacquired,
            principal,
            OpenMode::InspectTornTail,
        )?;
        let (inspected, suffix) = operational.capture_native_tail(original, minimum, principal)?;
        let participants = operational
            .room()
            .capture_generation_inventory_at(principal, inspected.backup.info()?.identity.native)?;
        operational.check_live_source(original, principal)?;
        let operation = operational.context.activation_owner_digest()?;
        verify(CommittedNativeTailCapture { inspected, participants, operation, suffix })
    }

    fn capture_native_tail(
        &mut self,
        original: &ServerLogGenerationRoomBackup,
        minimum: &ServerLogGenerationRoomBackup,
        principal: &str,
    ) -> Result<(InspectedNativeGenerationTail, Vec<u8>)> {
        let (room, assets) = self.components_mut();
        let (native, suffix) = room.export_inspected_log_generation_prefix(principal)?;
        let rasters = assets.export_backup()?;
        assets.check_exported_backup(&rasters)?;
        let backup = ServerLogGenerationRoomBackup::from_components(native, rasters)?;
        backup.check_archive_ancestor(original)?;
        if minimum.info()?.identity != *self.origin() {
            backup.check_archive_ancestor(minimum)?;
        }
        let inspected = InspectedNativeGenerationTail {
            backup,
            incomplete_bytes: suffix.len() as u64,
            incomplete_sha256: Sha256::digest(&suffix).into(),
        };
        Ok((inspected, suffix))
    }
}
