//! Retain the complete current cut of an actually activated recovery host.
use super::{super::ActivatedNativeLogGenerationHost, capture_source};
use crate::{
    Error, Result, ServerLogGenerationRoomBackupIdentity,
    server::generation_backup::durable::{
        Interruption, PreparedLogGenerationHandover, prepare_source,
    },
};
use std::path::Path;

impl ActivatedNativeLogGenerationHost {
    /// Authenticate the current owner and durably prepare its exact native and
    /// raster cut in an absent directory. The activated host keeps serving.
    /// Independently retain the returned intent identity before sealing.
    /// # Errors
    /// Wrong credentials, stale epoch or source, lost original custody,
    /// an occupied destination or uncertain storage refuse.
    pub async fn prepare_next_handover(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
        expected: ServerLogGenerationRoomBackupIdentity,
    ) -> Result<PreparedLogGenerationHandover> {
        self.host.host.authentication.authenticate(principal, token)?;
        let owner = self.host.clone();
        let selection = self.selection.clone();
        let principal = principal.to_owned();
        let destination = destination.to_owned();
        tokio::task::spawn_blocking(move || {
            let host = &owner.host;
            prepare_source(host, &destination, &expected, &Interruption::default(), |lease| {
                if lease.selection() != selection {
                    return Err(Error::Lease);
                }
                let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                let mut assets = host
                    .assets
                    .as_ref()
                    .ok_or(Error::NeedsRecovery)?
                    .lock()
                    .map_err(|_| Error::NeedsRecovery)?;
                capture_source(&owner, &mut room, &mut assets, &principal)
            })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
