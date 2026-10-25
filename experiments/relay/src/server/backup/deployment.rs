//! Fenced serving and host-only capture share the same actual transaction guard.
use super::{Authentication, ServerBackupHandle, routes};
use crate::{
    Result, Room,
    assets::AssetStore,
    server::{RoomDeploymentLease, deployment_fence::prepare_host},
};
use axum::Router;

/// Build explicitly fenced raster serving and its private host backup handle.
/// Captures hold the same serving permit through native/raster validation and
/// cannot bypass retirement or supersession. No network backup route is added.
/// This does not approve a recovered room or reconcile its clients and providers.
/// # Errors
/// Wrong native/profile/transport/asset binding or noncurrent lease refuses.
pub fn router_with_server_backups_and_deployment_lease(
    room: Room,
    authentication: Authentication,
    assets: AssetStore,
    lease: RoomDeploymentLease,
) -> Result<(Router, ServerBackupHandle)> {
    let host = prepare_host(room, authentication, Some(assets), lease)?;
    let handle = ServerBackupHandle { host: host.clone() };
    Ok((routes(host), handle))
}
