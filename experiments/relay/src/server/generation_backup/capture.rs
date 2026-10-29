//! Complete current source capture holds the actual serving transaction guard.
use super::LogGenerationServerBackupHandle;
use crate::{
    Error, Result, ServerLogGenerationRoomBackup,
    server::{Host, deployment_fence},
};

pub(super) fn capture(host: &Host, principal: &str) -> Result<ServerLogGenerationRoomBackup> {
    if host.generation_custody.is_some() {
        return Err(Error::Contract("joined generation original custody must be retained"));
    }
    host.deployment.fenced(|lease| {
        deployment_fence::transaction(Some(lease), || capture_under_permit(host, principal))
    })
}

pub(super) fn capture_under_permit(
    host: &Host,
    principal: &str,
) -> Result<ServerLogGenerationRoomBackup> {
    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
    let assets = host.assets.as_ref().ok_or(Error::Contract("generation source assets absent"))?;
    let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
    ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, principal)
}

impl LogGenerationServerBackupHandle {
    /// Authenticate the actual current owner and capture every native/raster source byte.
    /// Native work runs off async I/O workers and remains inside the serving epoch.
    /// # Errors
    /// Wrong authentication/owner/family, retired epochs, uncertain source or budgets refuse.
    pub async fn capture(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<ServerLogGenerationRoomBackup> {
        self.host.authentication.authenticate(principal, token)?;
        let host = self.host.clone();
        let principal = principal.to_owned();
        tokio::task::spawn_blocking(move || capture(&host, &principal))
            .await
            .map_err(|_| Error::NeedsRecovery)?
    }
}
