//! Capacity snapshots from the actual authenticated live generation source.
use super::LogGenerationServerBackupHandle;
use crate::{Error, Result, ServerRoomStorageCapacity, server::deployment_fence};

impl LogGenerationServerBackupHandle {
    /// Authenticate the current owner and capture capacity while holding the live deployment lease
    /// and both storage owners. This reads counters and inventory without building a room archive.
    /// # Errors
    /// Wrong authentication, retired epochs, missing raster ownership or uncertain files refuse.
    pub async fn storage_capacity(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<ServerRoomStorageCapacity> {
        self.host.authentication.authenticate(principal, token)?;
        let host = self.host.clone();
        let principal = principal.to_owned();
        tokio::task::spawn_blocking(move || {
            host.deployment.fenced(|lease| {
                deployment_fence::transaction(Some(lease), || {
                    let native = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                    let rasters = host
                        .assets
                        .as_ref()
                        .ok_or(Error::Contract("generation source assets absent"))?
                        .lock()
                        .map_err(|_| Error::NeedsRecovery)?;
                    native.storage_capacity(&rasters, &principal)
                })
            })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
