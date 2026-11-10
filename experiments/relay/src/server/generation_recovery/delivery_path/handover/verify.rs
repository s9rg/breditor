//! Verify each earlier archive and join it at the genuine sealed restore origin.
use super::super::{VerifiedServerLogGenerationDeliveryPath, limits, selected::check_inputs};
use super::{
    ServerLogGenerationHandoverDeliveryPathIdentity,
    ServerLogGenerationHandoverDeliveryPathOptions,
    VerifiedServerLogGenerationHandoverDeliveryPath,
};
use crate::{Error, Result, server::PreparedLogGenerationRecoveryHost};
use std::sync::Arc;

impl PreparedLogGenerationRecoveryHost {
    /// Check every retained client-selected archive through a sealed handover.
    /// The actual source seal must be the successor's exact restore origin.
    /// Earlier links and the existing successor-local path share one count and
    /// archive budget. The earlier archive copies can be released after
    /// verification because their exact bytes are included in the retained seal.
    ///
    /// # Errors
    /// Wrong authentication or host, a different selected seal or origin, a
    /// missing seal, wrong pins, reordered or forked archives, exceeded bounds,
    /// stale current cut, changed custody or uncertain storage refuse.
    pub async fn verify_handover_delivery_path(
        &self,
        principal: &str,
        token: &str,
        successor: Arc<VerifiedServerLogGenerationDeliveryPath>,
        options: ServerLogGenerationHandoverDeliveryPathOptions,
    ) -> Result<VerifiedServerLogGenerationHandoverDeliveryPath> {
        self.host.authentication.authenticate(principal, token)?;
        successor.current.check_host(self, principal)?;
        let ServerLogGenerationHandoverDeliveryPathOptions {
            handover,
            expected_handover,
            authority,
            earlier,
            expected_earlier,
        } = options;
        if handover.identity() != &expected_handover
            || expected_handover.source() != &successor.identity.current.origin
        {
            return Err(Error::Contract("delivery handover origin or choice differs"));
        }
        limits::check(earlier.len(), 0)?;
        let held_handover = handover.clone();
        let held_successor = successor.clone();
        let earlier = tokio::task::spawn_blocking(move || {
            let earlier: Vec<_> = earlier.into_iter().map(Arc::new).collect();
            let bytes = check_inputs(&earlier, &expected_earlier)?;
            let current_bytes =
                check_inputs(&held_successor.ancestors, &held_successor.identity.ancestors)?;
            limits::check(earlier.len() + held_successor.ancestors.len(), bytes + current_bytes)?;
            for pair in earlier.windows(2) {
                pair[1].check_archive_ancestor(&pair[0])?;
            }
            let last =
                earlier.last().ok_or(Error::Contract("delivery handover prefix is empty"))?;
            held_handover.source_backup().check_archive_ancestor(last)?;
            Ok::<_, Error>(expected_earlier)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)??;
        let identity = ServerLogGenerationHandoverDeliveryPathIdentity {
            format: "breditor/server-log-generation-handover-delivery-path",
            format_version: 1,
            seal: expected_handover.planned_selection().clone(),
            earlier,
            successor: successor.identity(),
        };
        let proof = VerifiedServerLogGenerationHandoverDeliveryPath {
            identity,
            handover,
            authority,
            successor,
        };
        proof.check_live(self, principal, token).await?;
        Ok(proof)
    }
}
