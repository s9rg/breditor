//! Losslessly pack a sealed WAL of the room served by this exact fenced host.
use super::LogGenerationServerBackupHandle;
use crate::{Error, Result, ServerSealedWalPacking, server::deployment_fence};

impl LogGenerationServerBackupHandle {
    /// Pack one selected immutable WAL under the current owner and serving lease.
    /// # Errors
    /// Wrong credentials, a superseded lease, invalid generation or uncertain storage refuses.
    pub async fn pack_sealed_wal(
        &self,
        principal: &str,
        token: &str,
        generation: &str,
    ) -> Result<ServerSealedWalPacking> {
        self.host.authentication.authenticate(principal, token)?;
        let host = self.host.clone();
        let principal = principal.to_owned();
        let generation = generation.to_owned();
        tokio::task::spawn_blocking(move || {
            host.deployment.fenced(|lease| {
                deployment_fence::transaction(Some(lease), || {
                    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                    room.pack_sealed_wal(&principal, &generation)
                })
            })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
