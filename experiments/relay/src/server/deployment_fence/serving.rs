//! Explicit fenced serving. These constructors do not approve a recovered cut.
use super::super::{Authentication, Host, create_host, routes};
use super::RoomDeploymentLease;
use crate::{Error, Result, Room, assets::AssetStore};
use axum::Router;
pub(in crate::server) fn prepare_host(
    room: Room,
    authentication: Authentication,
    assets: Option<AssetStore>,
    lease: RoomDeploymentLease,
) -> Result<Host> {
    if room.deployment_binding()? != lease.selection().identity.binding
        || assets.as_ref().is_some_and(|store| store.binding() != room.asset_binding())
    {
        return Err(Error::Contract("deployment native binding"));
    }
    lease.check()?;
    let mut host = create_host(room, authentication, assets);
    host.deployment = Some(lease);
    Ok(host)
}
/// Serve an explicitly supplied native room behind a genuine deployment epoch.
/// All participating hosts must use the same independent authority. This does
/// not prove that the supplied room contains every accepted/offline old edit;
/// a coordinated recovery must establish that separately before calling it.
/// Existing unfenced constructors and wire meanings are unchanged.
/// # Errors
/// Wrong native/profile/transport binding or noncurrent actual lease refuses.
pub fn router_with_deployment_lease(
    room: Room,
    authentication: Authentication,
    lease: RoomDeploymentLease,
) -> Result<Router> {
    Ok(routes(prepare_host(room, authentication, None, lease)?))
}
/// Fenced room and whole raster owner, with the same account/Origin policies.
/// Actual asset publication also runs under the serving epoch transaction.
/// # Errors
/// Wrong native/asset binding or noncurrent actual lease refuses.
pub fn router_with_assets_and_deployment_lease(
    room: Room,
    authentication: Authentication,
    assets: AssetStore,
    lease: RoomDeploymentLease,
) -> Result<Router> {
    Ok(routes(prepare_host(room, authentication, Some(assets), lease)?))
}
