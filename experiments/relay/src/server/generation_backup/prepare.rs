//! Source ownership enters both router and handle without a native release/reopen gap.
use super::{LogGenerationServerBackupHandle, capture::capture};
use crate::{
    Result, Room,
    assets::AssetStore,
    server::{Authentication, RoomDeploymentLease, deployment_fence::prepare_host, routes},
};
use axum::Router;

/// Build a fenced live generation router and its private actual-source capture handle.
/// Authenticate current host configuration, check owner/family and admit the whole source
/// on a worker before returning either. This adds no network backup/activation endpoint.
/// The supplied native room is not a portable recovery or room-adoption approval.
/// Joined recovered-host original custody still requires its separate activation contract.
/// # Errors
/// Wrong auth/owner/storage family, noncurrent lease, source uncertainty or budgets refuse.
pub async fn router_with_log_generation_backups_and_deployment_lease(
    room: Room,
    authentication: Authentication,
    assets: AssetStore,
    lease: RoomDeploymentLease,
    principal: &str,
    token: &str,
) -> Result<(Router, LogGenerationServerBackupHandle)> {
    authentication.authenticate(principal, token)?;
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let host = prepare_host(room, authentication, Some(assets), lease)?;
        capture(&host, &principal)?;
        let handle = LogGenerationServerBackupHandle { host: host.clone() };
        Ok((routes(host), handle))
    })
    .await
    .map_err(|_| crate::Error::NeedsRecovery)?
}
