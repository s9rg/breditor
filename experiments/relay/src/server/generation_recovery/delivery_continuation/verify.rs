//! Fresh host-only constructor; neither detached selections nor prefix counts grant it.
use super::super::{PreparedLogGenerationRecoveryHost, VerifiedServerLogGenerationRecoveryState};
use super::{
    ServerLogGenerationDeliveryContinuationIdentity,
    VerifiedServerLogGenerationDeliveryContinuation, selected::check_selected,
};
use crate::{Error, Result, ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity};
use std::sync::Arc;

impl PreparedLogGenerationRecoveryHost {
    /// Verify that a separately pinned previous serving cut B retains actual
    /// restore origin A and is fully retained by current cut C. The current proof
    /// must already cover EVERY actual protected document/comment registration.
    /// All physical log bytes/manifests and original raster bytes are checked in
    /// the same room-then-raster transaction. No edits, imports, ACKs or activation.
    /// # Errors
    /// Wrong auth/owner/host, stale current proof, wrong previous selection, forks,
    /// reversed order, missing old bytes/rasters or uncertain custody/storage refuse.
    pub async fn verify_delivery_continuation(
        &self,
        principal: &str,
        token: &str,
        previous: ServerLogGenerationRoomBackup,
        expected_previous: &ServerLogGenerationRoomBackupIdentity,
        current: Arc<VerifiedServerLogGenerationRecoveryState>,
    ) -> Result<VerifiedServerLogGenerationDeliveryContinuation> {
        self.host.authentication.authenticate(principal, token)?;
        current.check_host(self, principal)?;
        if previous.info()?.identity != *expected_previous {
            return Err(Error::Contract("delivery continuation previous selection differs"));
        }
        let identity = ServerLogGenerationDeliveryContinuationIdentity {
            format: "breditor/server-log-generation-delivery-continuation".into(),
            format_version: 1,
            previous: expected_previous.clone(),
            current: current.identity(),
        };
        let previous = Arc::new(previous);
        let assets = self.host.assets.clone().ok_or(Error::Contract("delivery rasters absent"))?;
        let custody = self
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("delivery custody absent"))?;
        let original = self.original.clone();
        let retained = previous.clone();
        let expected = identity.clone();
        let owner = principal.to_owned();
        self.host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(room, &mut assets, &original, &retained, &custody, &owner, &expected)
            })
            .await?;
        Ok(VerifiedServerLogGenerationDeliveryContinuation { identity, current, previous })
    }
}
