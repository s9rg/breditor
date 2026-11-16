//! Maintain native history on the same live, fenced source that serves clients.
use super::LogGenerationServerBackupHandle;
use crate::{
    Error, Result, ServerNativeHistoryBoundary, ServerNativeHistoryLane, ServerNativeHistoryPlan,
    ServerNativeHistoryReceipt, ServerNativeHistorySelection,
    server::{ServerBackupHandle, deployment_fence},
};

impl LogGenerationServerBackupHandle {
    /// Preview a native boundary on this currently fenced generation source.
    /// # Errors
    /// Refuses invalid owner credentials, stale service, uncertain custody or native/WAL limits.
    pub async fn prepare_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        lane: ServerNativeHistoryLane,
        boundary: ServerNativeHistoryBoundary,
    ) -> Result<ServerNativeHistoryPlan> {
        ServerBackupHandle { host: self.host.clone() }
            .prepare_native_history_boundary(principal, token, lane, boundary)
            .await
    }

    /// Apply a native boundary only at the selected native and durable log cut.
    /// # Errors
    /// Refuses invalid owner credentials, stale service or selection, capacity drift or storage.
    pub async fn apply_prepared_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        selection: ServerNativeHistorySelection,
    ) -> Result<ServerNativeHistoryReceipt> {
        ServerBackupHandle { host: self.host.clone() }
            .apply_prepared_native_history_boundary(principal, token, selection)
            .await
    }

    /// Read an already accepted boundary outcome on this authenticated generation source.
    /// # Errors
    /// Refuses invalid owner credentials, stale service, uncertain custody or mismatched receipts.
    pub async fn resolve_native_history_boundary(
        &self,
        principal: &str,
        token: &str,
        selection: ServerNativeHistorySelection,
    ) -> Result<Option<ServerNativeHistoryReceipt>> {
        ServerBackupHandle { host: self.host.clone() }
            .resolve_native_history_boundary(principal, token, selection)
            .await
    }

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
