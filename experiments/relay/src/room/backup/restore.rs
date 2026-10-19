//! Full semantic replay precedes atomic insert-only publication; old connection leases stay absent.
use super::{RoomBackup, RoomBackupIdentity, RoomRecoveryPolicy, staging::StagedLog};
use crate::{Error, Result, Room};
use std::path::Path;

impl Room {
    /// Restore exact server history to an absent destination in an existing host-owned directory.
    /// The host must fence the original deployment separately. File integrity is not authority.
    /// Supply the original genesis/owner/transport identity and selected log cut from trusted
    /// independent host configuration, never from the incoming file being verified;
    /// a backup must never silently select another room or migrate its native profile.
    /// All native/role/receipt/decision replay runs on a private staging inode before publication.
    /// Existing IDs/credential digests survive; ephemeral leases never do. Resume explicitly.
    ///
    /// # Errors
    /// Rejects incompatible replay, occupied/racing targets and storage failure. If a failure occurs
    /// after publication, the complete destination may exist: inspect/open it, never overwrite it.
    /// Hard-link publication and file/directory sync require a suitable local filesystem.
    pub fn restore_backup(
        destination: &Path,
        backup: &RoomBackup,
        identity: &RoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        let RoomRecoveryPolicy::HostReacquired = policy;
        if backup.snapshot.cut() != (identity.records, identity.terminal_log_digest) {
            return Err(Error::Contract("room backup selected log cut"));
        }
        let staged = StagedLog::write(destination, &backup.snapshot.bytes)?;
        let (room, recovery) = Self::open(&staged.path)?;
        if recovery.truncated_bytes != 0 {
            return Err(Error::Contract("room backup cannot recover a partial tail"));
        }
        if &room.backup_identity()? != identity {
            return Err(Error::Contract("room backup source identity"));
        }
        staged.publish()?;
        Ok(room)
    }
}
