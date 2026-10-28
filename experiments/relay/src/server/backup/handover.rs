//! Explicit, irreversible source quiescence; never replacement activation.
use super::ServerBackupHandle;
#[cfg(test)]
mod cancellation;
use crate::{
    Error, Result, ServerRoomBackup, ServerRoomBackupIdentity,
    server::{RoomDeploymentSelection, deployment_fence},
};

/// Complete accepted original server cut captured while retiring its actual serving epoch.
/// Contains private history and credential digests. Keep host-only. No replacement lease,
/// client acknowledgement, provider closure or activation authority is contained here.
/// Dropping this DATA does not restart the old host or delete any source file.
/// ```compile_fail
/// use breditor_collab_relay::server::SealedServerHandover;
/// let _: SealedServerHandover = serde_json::from_str("{}").unwrap();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::SealedServerHandover;
/// let _: SealedServerHandover = Default::default();
/// ```
#[must_use]
pub struct SealedServerHandover {
    backup: ServerRoomBackup,
    previous: RoomDeploymentSelection,
    sealed: RoomDeploymentSelection,
}
impl SealedServerHandover {
    /// Detached original serving epoch, not a grant to restart it.
    #[must_use]
    pub fn previous_selection(&self) -> &RoomDeploymentSelection {
        &self.previous
    }
    /// Detached durable sealed epoch. No serving lease for this epoch is returned.
    #[must_use]
    pub fn sealed_selection(&self) -> &RoomDeploymentSelection {
        &self.sealed
    }
    /// Exact whole accepted log/raster DATA, including deleted history and unreferenced rasters.
    #[must_use]
    pub fn backup(&self) -> &ServerRoomBackup {
        &self.backup
    }
    /// Transfer complete DATA for explicit persistence/recovery, never a serving capability.
    #[must_use]
    pub fn into_backup(self) -> ServerRoomBackup {
        self.backup
    }
}
impl ServerBackupHandle {
    /// Irreversibly fence this original-storage host only if its actual complete accepted
    /// log/raster cut STILL equals the separately selected backup. Capture, comparison and
    /// durable epoch append share one real exclusive deployment lock, before room/assets locks.
    /// Every old participating transaction either finishes before capture or refuses afterward.
    /// Stale selections append nothing. This private host capability adds no network endpoint.
    ///
    /// This deliberately stops old serving, but starts NO replacement. Persist the returned
    /// archive before discarding original sources. Client/offline queues, provider mappings,
    /// native-generation sources and whole-room activation require their separate coordinators.
    /// Once blocking work starts, dropping this future does NOT cancel it: query the actual
    /// authority afterward, retain original files, and never assume that an error resumes serving.
    /// # Errors
    /// Unfenced/stale/closed hosts, busy workers, changed selected cuts, wrong storage family,
    /// uncertain native/raster bytes, budget, entropy, append/sync/unlock failures refuse.
    /// Uncertain append poisons the actual authority; no automatic rollback or smaller cut occurs.
    pub async fn seal_for_handover(
        &self,
        expected: ServerRoomBackupIdentity,
    ) -> Result<SealedServerHandover> {
        let host = self.host.clone();
        let (backup, previous, sealed) =
            tokio::task::spawn_blocking(move || deployment_fence::seal(&host, &expected))
                .await
                .map_err(|_| Error::NeedsRecovery)??;
        Ok(SealedServerHandover { backup, previous, sealed })
    }
}
