//! Persist source DATA outside the serving lock; sealing must compare the cut again.
use super::{Interruption, PreparedLogGenerationHandover, Store};
use crate::{
    Error, Result, ServerLogGenerationRoomBackupIdentity,
    server::{
        Host, RoomDeploymentLease, deployment_fence,
        generation_backup::{LogGenerationServerBackupHandle, capture},
    },
};
use std::path::Path;
pub(in crate::server) fn prepare(
    host: &Host,
    principal: &str,
    root: &Path,
    expected: &ServerLogGenerationRoomBackupIdentity,
    stop: &Interruption,
) -> Result<PreparedLogGenerationHandover> {
    if host.generation_custody.is_some() {
        return Err(Error::Contract("joined generation original custody must be retained"));
    }
    prepare_source(host, root, expected, stop, |_| capture::capture_under_permit(host, principal))
}

/// Capture under the actual current lease, then persist outside its serving permit.
pub(in crate::server) fn prepare_source(
    host: &Host,
    root: &Path,
    expected: &ServerLogGenerationRoomBackupIdentity,
    stop: &Interruption,
    capture: impl FnOnce(&RoomDeploymentLease) -> Result<crate::ServerLogGenerationRoomBackup>,
) -> Result<PreparedLogGenerationHandover> {
    let (backup, previous) = host.deployment.fenced(|lease| {
        deployment_fence::transaction(Some(lease), || {
            let backup = capture(lease)?;
            if &backup.info()?.identity != expected {
                return Err(Error::Contract("prepared handover source cut changed"));
            }
            Ok((backup, lease.selection()))
        })
    })?;
    Ok(PreparedLogGenerationHandover { store: Store::create(root, backup, previous, stop)? })
}
impl LogGenerationServerBackupHandle {
    /// Authenticate and durably prepare the entire selected native/raster source in
    /// an absent private directory. Persist the returned identity independently before
    /// sealing. This performs no epoch claim or client acknowledgement. Source edits
    /// can continue after capture; a later seal must reject changed accepted data.
    /// Cancellation may leave complete or incomplete files; none are silently replaced.
    /// # Errors
    /// Wrong current auth/owner, stale whole cut, occupied path, storage/custody or budgets refuse.
    pub async fn prepare_handover(
        &self,
        principal: &str,
        token: &str,
        root: &Path,
        expected: ServerLogGenerationRoomBackupIdentity,
    ) -> Result<PreparedLogGenerationHandover> {
        self.host.authentication.authenticate(principal, token)?;
        let host = self.host.clone();
        let principal = principal.to_owned();
        let root = root.to_owned();
        tokio::task::spawn_blocking(move || {
            prepare(&host, &principal, &root, &expected, &Interruption::default())
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
