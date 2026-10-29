//! Native constructor only; saved JSON/counters do not supply any verified link.
use super::super::{PreparedLogGenerationRecoveryHost, VerifiedServerLogGenerationRecoveryState};
use super::{
    ServerLogGenerationDeliveryPathIdentity, VerifiedServerLogGenerationDeliveryPath,
    selected::{check_inputs, check_selected},
};
use crate::{Error, Result, ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity};
use std::sync::Arc;
impl PreparedLogGenerationRecoveryHost {
    /// Verify all complete independently selected predecessors in order, from the
    /// ACTUAL restore origin A through B/C1/... to current D. Every adjacent native
    /// file/manifest and raster inclusion link is checked, not just first/last or
    /// recorded author counters. Requires this same live host/owner's genuine
    /// protected-stream current proof. One room-then-rasters transaction is used.
    /// Empty, over4096 or over2GiB paths refuse; originals and protocol defaults
    /// are never trimmed, overwritten, relabelled or activated by this operation.
    /// # Errors
    /// Wrong auth/owner/host, mismatched pins, native or raster forks, reordered
    /// intermediate cuts, stale current proof and uncertain storage/custody refuse.
    pub async fn verify_delivery_path(
        &self,
        principal: &str,
        token: &str,
        provided: Vec<ServerLogGenerationRoomBackup>,
        expected_ancestors: &[ServerLogGenerationRoomBackupIdentity],
        current: Arc<VerifiedServerLogGenerationRecoveryState>,
    ) -> Result<VerifiedServerLogGenerationDeliveryPath> {
        self.host.authentication.authenticate(principal, token)?;
        current.check_host(self, principal)?;
        super::limits::check(provided.len(), 0)?;
        let ancestors: Vec<_> = provided.into_iter().map(Arc::new).collect();
        check_inputs(&ancestors, expected_ancestors)?;
        let identity = ServerLogGenerationDeliveryPathIdentity {
            format: "breditor/server-log-generation-delivery-path".into(),
            format_version: 1,
            ancestors: expected_ancestors.to_vec(),
            current: current.identity(),
        };
        let assets =
            self.host.assets.clone().ok_or(Error::Contract("delivery path rasters absent"))?;
        let custody = self
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("delivery path custody absent"))?;
        let original = self.original.clone();
        let retained = ancestors.clone();
        let expected = identity.clone();
        let owner = principal.to_owned();
        self.host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(room, &mut assets, &original, &retained, &custody, &owner, &expected)
            })
            .await?;
        Ok(VerifiedServerLogGenerationDeliveryPath { identity, current, ancestors })
    }
}
