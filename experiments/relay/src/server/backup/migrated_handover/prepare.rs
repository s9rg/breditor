//! Persist the deterministic migrated source before fencing the legacy host.
use super::capture_original;
use crate::{
    Error, Result, ServerLogGenerationOptions, ServerRoomBackupIdentity,
    server::{
        ServerBackupHandle, deployment_fence,
        generation_backup::durable::{Interruption, PreparedLogGenerationHandover, Store},
    },
};
use std::path::Path;

impl ServerBackupHandle {
    /// Authenticate the original room owner and retain a complete migration of
    /// the independently selected live cut in a new private intent directory.
    /// The old host keeps serving. Save the returned identity and generation
    /// choices independently before requesting a seal. No target is started.
    ///
    /// # Errors
    /// Unfenced serving, stale cut, wrong owner or authentication, invalid
    /// generation IDs, occupied destination or uncertain storage refuse.
    pub async fn prepare_generation_migration_handover(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
        expected: ServerRoomBackupIdentity,
        options: ServerLogGenerationOptions,
    ) -> Result<PreparedLogGenerationHandover> {
        self.host.authentication.authenticate(principal, token)?;
        options.validate()?;
        let host = self.host.clone();
        let principal = principal.to_owned();
        let destination = destination.to_owned();
        tokio::task::spawn_blocking(move || {
            let (original, previous) = host.deployment.fenced(|lease| {
                deployment_fence::transaction(Some(lease), || {
                    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                    let assets =
                        host.assets.as_ref().ok_or(Error::Contract("source rasters absent"))?;
                    let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                    let original = capture_original(&mut room, &mut assets, &principal)?;
                    if original.info().identity != expected {
                        return Err(Error::Contract("original migration source cut changed"));
                    }
                    Ok((original, lease.selection()))
                })
            })?;
            let backup = original.prepare_generation_migration(&expected, &options)?;
            let store = Store::create(&destination, backup, previous, &Interruption::default())?;
            Ok(PreparedLogGenerationHandover { store })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
