//! Explicit authenticated reference serving under a genuine host-selected deployment epoch.
use super::{
    GenerationDirectory, RasterCustody, RecoveredRelaySegmentRoom,
    client_journals::RetainedJournals, client_uploads::RetainedUploads,
};
use crate::{
    Error, Result, Room,
    assets::AssetStore,
    server::{Authentication, RoomDeploymentLease, router_with_recovered_segment},
};

pub(crate) struct RelaySegmentServingCustody {
    directory: GenerationDirectory,
    raster: RasterCustody,
    _uploads: Option<RetainedUploads>,
    journals: Option<RetainedJournals>,
    alternatives: Option<RetainedJournals>,
}

impl RelaySegmentServingCustody {
    pub(crate) fn check(&self) -> Result<()> {
        self.directory.guard()?;
        self.raster.guard_root()?;
        for journals in [&self.journals, &self.alternatives].into_iter().flatten() {
            journals.check()?;
        }
        Ok(())
    }
}

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
        if self.requires_verified_handover() {
            return Err(Error::Contract("client inputs require verified handover"));
        }
        let (router, _) = router_with_recovered_segment(self, authentication, lease)?;
        Ok(router)
    }

    pub(crate) fn into_deployment_parts(
        self,
    ) -> Result<(Room, AssetStore, RelaySegmentServingCustody)> {
        self.check_custody()?;
        let Self { room, assets, directory, raster, uploads, journals, alternatives, .. } = self;
        Ok((
            room,
            assets,
            RelaySegmentServingCustody {
                directory,
                raster,
                _uploads: uploads,
                journals,
                alternatives,
            },
        ))
    }
}
