//! Actual held joined owners. No router/provider starts and no account privilege is inferred.
use super::{custody::JoinedRecoveryCustody, selection::Marker};
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
    pub(super) custody: JoinedRecoveryCustody,
    pub(super) room: Room,
    pub(super) assets: AssetStore,
}
impl RecoveredLogGenerationServerRoom {
    /// Exact inactive server root, not an activation credential.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.custody.directory.path
    }
    /// Actual held native room; callers still authenticate every account operation.
    #[must_use]
    pub fn room(&self) -> &Room {
        &self.room
    }
    /// Mutate native history under the usual host-authenticated Room contracts.
    #[must_use]
    pub fn room_mut(&mut self) -> &mut Room {
        &mut self.room
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
        (&mut self.room, &mut self.assets)
    }
}
