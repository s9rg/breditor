//! Explicit live serving and exact backup for the continued raster storage family.
mod activation;
mod approval;
mod backup;
pub use activation::{ContinuedRasterActivation, ContinuedRasterRestart};
pub use approval::ContinuedRasterActivationApproval;
mod native_tail;
pub use native_tail::{
    ContinuedRasterNativeTailInspection, ContinuedRasterNativeTailOutcome,
    ContinuedRasterNativeTailPlan, ContinuedRasterNativeTailRepair,
};
mod reconcile;
pub use reconcile::ContinuedRasterRoomInputReport;
mod seal;
pub use seal::{ContinuedRasterSeal, ContinuedRasterSealing, SealedContinuedRasterActivation};
mod store;
#[cfg(all(test, unix))]
mod tests;

pub use backup::ContinuedRasterRoomBackupIdentity;
pub(super) use store::HttpRasterStore;

use super::{Authentication, Host, RoomDeploymentLease, create_host, deployment_fence, routes};
use crate::{ContinuedAssetStore, Error, Result, Room};
use axum::Router;
use std::sync::{Arc, Mutex};

/// Host-local current owner for capturing a fenced room with continued assets.
pub struct ContinuedAssetServerHandle {
    host: Host,
}

/// Serve a native room and its continued raster store behind the actual current deployment epoch.
/// Supply a room already selected for serving by the host's activation procedure.
/// Existing requests, content IDs, account checks and upload receipts apply to both generations.
///
/// # Errors
/// Refuses a noncurrent lease, different room or changed continued raster custody.
pub fn router_with_continued_assets_and_deployment_lease(
    room: Room,
    authentication: Authentication,
    assets: ContinuedAssetStore,
    lease: RoomDeploymentLease,
) -> Result<(Router, ContinuedAssetServerHandle)> {
    build(room, authentication, assets, lease, None)
}

fn build(
    room: Room,
    authentication: Authentication,
    assets: ContinuedAssetStore,
    lease: RoomDeploymentLease,
    custody: Option<crate::room::ContinuedServingCustody>,
) -> Result<(Router, ContinuedAssetServerHandle)> {
    if let Some(held) = &custody {
        held.check(&room)?;
    }
    if room.asset_binding() != assets.binding() {
        return Err(Error::Contract("continued raster store room binding"));
    }
    assets.guard()?;
    let mut host = create_host(room, authentication, None);
    host.continued_assets = Some(Arc::new(Mutex::new(assets)));
    host.continued_custody = custody.map(Arc::new);
    deployment_fence::attach_host(&host, lease)?;
    let handle = ContinuedAssetServerHandle { host: host.clone() };
    Ok((routes(host), handle))
}

impl Host {
    pub(super) fn serves_assets(&self) -> bool {
        self.assets.is_some() || self.continued_assets.is_some()
    }
}
