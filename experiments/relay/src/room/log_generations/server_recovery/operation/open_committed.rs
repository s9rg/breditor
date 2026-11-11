//! Reacquire only an already committed operational handoff.
use super::{OperationalLogGenerationServerRoom, resume::OpenMode};
use crate::{
    Result, RoomRecoveryPolicy, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupIdentity,
};
use std::path::Path;

impl OperationalLogGenerationServerRoom {
    /// Reopen an existing committed handoff under the original retained source
    /// and current host policy. Preserve a staged marker even if it aliases the
    /// committed record. The caller may explicitly resume the handoff to finish
    /// interrupted marker writes or retire that alias.
    ///
    /// # Errors
    /// Missing or incomplete markers, changed custody, wrong source or owner,
    /// or unverifiable native or raster data refuse without repairing storage.
    pub fn open_committed(
        root: &Path,
        backup: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
        principal: &str,
    ) -> Result<Self> {
        Self::open_operational(root, backup, expected, policy, principal, OpenMode::Committed)
    }
}
