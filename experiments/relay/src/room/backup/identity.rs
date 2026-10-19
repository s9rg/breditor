//! Exact host-selected genesis/transport identity; a file must not silently select another room.
use super::RoomBackupIdentity;
use crate::{Result, Room};

impl Room {
    /// Read the original room identity for the host's separately retained recovery configuration.
    /// The trusted expected cut pins the selected history, not a globally latest room state.
    /// This detached value is not a credential or a live-source guard.
    /// # Errors
    /// Rejects a room whose uncertain storage result requires recovery.
    pub fn backup_identity(&self) -> Result<RoomBackupIdentity> {
        let (records, terminal_log_digest) = self.log.snapshot_cut()?;
        Ok(RoomBackupIdentity {
            document: self.replica.document_id().into(),
            owner: self.owner.clone(),
            asset_binding: self.asset_binding.clone(),
            profile: crate::AtomicTransportProfile::from_seed(self.profile_seed),
            writer_transport_version: self.writer_transport_version(),
            records,
            terminal_log_digest,
        })
    }
}
