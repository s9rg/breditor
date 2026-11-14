//! Explicit authenticated reference serving under a genuine host-selected deployment epoch.
use super::RecoveredRelaySegmentRoom;
use crate::{
    Result,
    server::{Authentication, RoomDeploymentLease, router_with_assets_and_deployment_lease},
};

impl RecoveredRelaySegmentRoom {
    /// Serve the restored room and rasters behind the existing deployment epoch and
    /// ordinary account/Origin authentication. Supply a fresh lease from the same
    /// authority all participating hosts use. Obtain approval for the exact backup cut
    /// and reconcile durable client/provider work before commissioning a replacement.
    ///
    /// # Errors
    /// Wrong room, unavailable or superseded lease, or changed custody refuses.
    pub fn into_serving_router(
        self,
        authentication: Authentication,
        lease: RoomDeploymentLease,
    ) -> Result<axum::Router> {
        self.check_custody()?;
        // Keep the outer completed restore exclusively owned for the Router's lifetime.
        let Self { room, assets, directory, raster } = self;
        let router = router_with_assets_and_deployment_lease(room, authentication, assets, lease)?;
        Ok(router.layer(axum::Extension(std::sync::Arc::new((directory, raster)))))
    }
}
