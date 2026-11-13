//! Maintain native history on the same live, fenced source that serves clients.
use super::LogGenerationServerBackupHandle;
use crate::{
    Error, Result, ServerNativeHistoryBoundary, ServerNativeHistoryLane,
    ServerNativeHistoryReceipt, server::deployment_fence,
};

impl LogGenerationServerBackupHandle {
    /// Run an explicit native history boundary on the current serving room.
    /// An exact retry acknowledges the original durable boundary.
    /// # Errors
    /// Non-owner authentication, a retired lease, invalid intent or uncertain storage refuses.
    pub async fn apply_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        lane: ServerNativeHistoryLane,
        boundary: ServerNativeHistoryBoundary,
    ) -> Result<ServerNativeHistoryReceipt> {
        self.host.authentication.authenticate(principal, token)?;
        let host = self.host.clone();
        let principal = principal.to_owned();
        tokio::task::spawn_blocking(move || {
            host.deployment.fenced(|lease| {
                deployment_fence::transaction(Some(lease), || {
                    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                    room.commit_native_history(&principal, lane, boundary)
                })
            })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
