//! Actual held joined owners. No router/provider starts and no account privilege is inferred.
use super::super::RecoveredLogGenerationRoom;
use super::{raster_directory::RasterCustody, selection::Marker};
use crate::{Room, assets::AssetStore, log::generations::GenerationDirectory};
use std::path::Path;

/// Inactive absent-only reservation. Preserve its source and files for explicit exact resume.
pub struct ServerLogGenerationRoomRecovery {
    pub(super) directory: GenerationDirectory,
    pub(super) marker: Marker,
    #[cfg(test)]
    pub(super) stop_after: Option<super::interruption::JoinedPoint>,
}
/// Complete natively verified server history and exact original rasters behind a synced barrier.
/// Client/provider reconciliation, original protected credentials and fresh host authority remain
/// required before deployment. Old connection leases stay absent and revoked grants stay revoked.
pub struct RecoveredLogGenerationServerRoom {
    pub(super) controls: super::super::control_seal::RecoveryControlSeal,
    pub(super) native_controls: super::super::control_seal::RecoveryControlSeal,
    pub(super) directory: GenerationDirectory,
    pub(super) marker: Marker,
    pub(super) native: RecoveredLogGenerationRoom,
    pub(super) assets: AssetStore,
    pub(super) raster: RasterCustody,
}
impl RecoveredLogGenerationServerRoom {
    /// Exact inactive server root, not an activation credential.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.directory.path
    }
    /// Actual held native room; callers still authenticate every account operation.
    #[must_use]
    pub fn room(&self) -> &Room {
        self.native.room()
    }
    /// Mutate native history under the usual host-authenticated Room contracts.
    #[must_use]
    pub fn room_mut(&mut self) -> &mut Room {
        self.native.room_mut()
    }
    /// Exact original raster owner; no provider mapping or deletion authority is inferred.
    #[must_use]
    pub fn assets(&self) -> &AssetStore {
        &self.assets
    }
    /// Uploads remain subject to the ordinary immutable store contract and host authorization.
    #[must_use]
    pub fn assets_mut(&mut self) -> &mut AssetStore {
        &mut self.assets
    }
    /// Borrow both actual owners together while retaining all coordinator/root leases.
    /// Host authentication and any later operational/deployment transition remain explicit.
    #[must_use]
    pub fn components_mut(&mut self) -> (&mut Room, &mut AssetStore) {
        (self.native.room_mut(), &mut self.assets)
    }
}
