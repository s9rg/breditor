//! Irreversible source fence returns complete DATA, never a replacement serving lease.
use super::LogGenerationServerBackupHandle;
use crate::{
    Error, Result, ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    server::{RoomDeploymentSelection, deployment_fence},
};

/// Complete generation source DATA and its retired/sealed deployment selections.
/// Contains private history and credential digests. Keep host-only. No replacement
/// serving lease, client ACK, provider closure or activation permission is returned.
/// A detached sealed selection cannot be used as a replacement serving capability:
///
/// ```compile_fail,E0308
/// use breditor_collab_relay::server::{RoomDeploymentLease, SealedLogGenerationHandover};
/// fn cannot_serve(closed: &SealedLogGenerationHandover) -> RoomDeploymentLease {
///     closed.sealed_selection().clone()
/// }
/// ```
#[must_use]
pub struct SealedLogGenerationHandover {
    backup: ServerLogGenerationRoomBackup,
    previous: RoomDeploymentSelection,
    sealed: RoomDeploymentSelection,
}
impl SealedLogGenerationHandover {
    /// Detached old serving epoch, never a grant to revive it.
    #[must_use]
    pub fn previous_selection(&self) -> &RoomDeploymentSelection {
        &self.previous
    }
    /// Detached durable sealed epoch. It has no returned serving lease.
    #[must_use]
    pub fn sealed_selection(&self) -> &RoomDeploymentSelection {
        &self.sealed
    }
    /// Exact complete accepted native/raster DATA, not a writer capability.
    #[must_use]
    pub fn backup(&self) -> &ServerLogGenerationRoomBackup {
        &self.backup
    }
    /// Transfer complete immutable DATA for independently authorized recovery.
    #[must_use]
    pub fn into_backup(self) -> ServerLogGenerationRoomBackup {
        self.backup
    }
}
impl LogGenerationServerBackupHandle {
    /// Authenticate again and retire this actual serving source only if the entire
    /// selected native/raster cut still matches. Capture and synced epoch append share
    /// one exclusive deployment lock held before room/assets locks. No replacement starts.
    /// Once blocking work starts, cancellation does not cancel the worker: inspect the
    /// real authority, preserve all original files, and never assume an error revives serving.
    /// # Errors
    /// Wrong current auth/owner, stale cut/epoch, busy source, uncertain storage or budgets refuse.
    /// An uncertain append poisons the authority without truncating or rolling back source data.
    pub async fn seal_for_handover(
        &self,
        principal: &str,
        token: &str,
        expected: ServerLogGenerationRoomBackupIdentity,
    ) -> Result<SealedLogGenerationHandover> {
        self.host.authentication.authenticate(principal, token)?;
        let host = self.host.clone();
        let principal = principal.to_owned();
        let (backup, previous, sealed) = tokio::task::spawn_blocking(move || {
            deployment_fence::seal_log_generation(&host, &principal, &expected)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)??;
        Ok(SealedLogGenerationHandover { backup, previous, sealed })
    }
}
