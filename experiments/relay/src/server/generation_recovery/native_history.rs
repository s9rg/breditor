//! Retain original room and asset custody while maintaining a recovered serving room.
use super::{ActivatedNativeLogGenerationHost, next_handover::check_source};
use crate::{
    Error, Result, ServerNativeHistoryBoundary, ServerNativeHistoryLane,
    ServerNativeHistoryReceipt, server::deployment_fence,
};

impl ActivatedNativeLogGenerationHost {
    /// Run an explicit native history boundary under this host's current serving lease.
    /// A started operation may commit even if its waiter is cancelled. An exact retry
    /// acknowledges the original durable boundary after recovery when necessary.
    /// # Errors
    /// Wrong credentials, stale authority, missing original custody, invalid intent or
    /// uncertain storage refuses.
    pub async fn apply_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        lane: ServerNativeHistoryLane,
        boundary: ServerNativeHistoryBoundary,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.host.host.authentication.authenticate(principal, token)?;
        let owner = self.host.clone();
        let selection = self.selection.clone();
        let principal = principal.to_owned();
        tokio::task::spawn_blocking(move || {
            let host = &owner.host;
            host.deployment.fenced(|lease| {
                if lease.selection() != selection {
                    return Err(Error::Lease);
                }
                deployment_fence::transaction(Some(lease), || {
                    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                    let mut assets = host
                        .assets
                        .as_ref()
                        .ok_or(Error::NeedsRecovery)?
                        .lock()
                        .map_err(|_| Error::NeedsRecovery)?;
                    check_source(&owner, &mut room, &mut assets, &principal)?;
                    let receipt = room.commit_native_history(&principal, lane, boundary)?;
                    check_source(&owner, &mut room, &mut assets, &principal)?;
                    Ok(receipt)
                })
            })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
