//! Compare and seal the exact current cut without dropping the old serving owner.
use super::{super::ActivatedNativeLogGenerationHost, capture_source, check_source};
use crate::{
    Error, Result,
    server::{
        PreparedLogGenerationHandover, PreparedLogGenerationHandoverIdentity, deployment_fence,
        generation_backup::durable::Interruption,
    },
};
use std::sync::Arc;

impl ActivatedNativeLogGenerationHost {
    /// Reauthenticate and seal an independently selected prepared intent under
    /// the current serving epoch. Retain the same intent to inspect uncertain
    /// completion. A started worker can finish after the awaiting future drops.
    /// # Errors
    /// Wrong credentials, intent, epoch or source, changed retained custody,
    /// contention or uncertain storage refuse.
    pub async fn seal_next_handover(
        &self,
        principal: &str,
        token: &str,
        prepared: &Arc<PreparedLogGenerationHandover>,
        expected: &PreparedLogGenerationHandoverIdentity,
    ) -> Result<()> {
        self.host.host.authentication.authenticate(principal, token)?;
        if prepared.identity() != expected {
            return Err(Error::Contract("prepared handover selected intent differs"));
        }
        let owner = self.host.clone();
        let selection = self.selection.clone();
        let principal = principal.to_owned();
        let prepared = prepared.clone();
        tokio::task::spawn_blocking(move || {
            let host = &owner.host;
            host.deployment.fenced(|lease| {
                if lease.selection() != selection {
                    return Err(Error::Lease);
                }
                deployment_fence::seal_prepared_for_lease(
                    host,
                    lease,
                    &prepared,
                    &Interruption::default(),
                    |room, assets| capture_source(&owner, room, assets, &principal),
                    |backup, room, assets| {
                        backup.check_live(room, assets, &principal)?;
                        check_source(&owner, room, assets, &principal)
                    },
                )
            })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
