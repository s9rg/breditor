//! Actual operational owners and their durable original source, not an activation credential.
use super::super::super::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupFile,
    ServerLogGenerationRoomBackupIdentity,
};
use super::{super::RecoveredLogGenerationServerRoom, super::origin::Origin, context::Context};
use crate::{Error, Result, Room, assets::AssetStore};
use std::path::Path;

/// Continuing joined native/raster storage. Current host permissions and all provider/client
/// reconciliation are separate; this type neither starts networking nor fences another host.
/// It cannot be reconstructed from serialized metadata alone.
pub struct OperationalLogGenerationServerRoom {
    pub(super) recovered: RecoveredLogGenerationServerRoom,
    pub(super) context: Context,
}
impl OperationalLogGenerationServerRoom {
    /// Actual retained joined directory.
    #[must_use]
    pub fn root(&self) -> &Path {
        self.recovered.root()
    }
    /// Independently retain this original selection and its archive for later cold reopen.
    #[must_use]
    pub fn origin(&self) -> &ServerLogGenerationRoomBackupIdentity {
        &self.context.marker.selection.source
    }
    /// Actual native authority; all account operations still require host authentication.
    #[must_use]
    pub fn room(&self) -> &Room {
        self.recovered.room()
    }
    /// Mutate under the ordinary authenticated native Room contracts.
    #[must_use]
    pub fn room_mut(&mut self) -> &mut Room {
        self.recovered.room_mut()
    }
    /// Actual immutable raster owner, not provider mapping or deletion authority.
    #[must_use]
    pub fn assets(&self) -> &AssetStore {
        self.recovered.assets()
    }
    /// Ordinary immutable uploads; original records remain retained for history/offline clients.
    #[must_use]
    pub fn assets_mut(&mut self) -> &mut AssetStore {
        self.recovered.assets_mut()
    }
    /// Borrow both actual owners without releasing their coordinator or component leases.
    #[must_use]
    pub fn components_mut(&mut self) -> (&mut Room, &mut AssetStore) {
        self.recovered.components_mut()
    }
    /// Revalidate original physical/native/raster ancestry and all local recovery controls while
    /// admitting complete later edits, native/physical generations and immutable raster additions.
    /// # Errors
    /// Non-owner, different source, forks, changed controls/custody or uncertain storage refuse.
    /// This is storage provenance, not evidence of client/provider coverage or permission to deploy.
    pub fn check_live_source(
        &mut self,
        backup: &ServerLogGenerationRoomBackup,
        principal: &str,
    ) -> Result<()> {
        self.check_live_origin(Origin::Buffered(backup), principal)
    }

    /// Verify continuing native history, raster retention and durable custody against a held file.
    /// # Errors
    /// Different original, missing history/files, non-owner access or uncertain custody refuses.
    pub fn check_live_source_file(
        &mut self,
        backup: &ServerLogGenerationRoomBackupFile,
        principal: &str,
    ) -> Result<()> {
        self.check_live_origin(Origin::File(backup), principal)
    }

    pub(super) fn check_live_origin(&mut self, backup: Origin<'_>, principal: &str) -> Result<()> {
        if !self.context.guard(&self.recovered.custody.directory)? {
            return Err(Error::Contract("generation operational marker no longer committed"));
        }
        self.recovered.check_source(backup, principal, false, &self.context.extra)?;
        if !self.context.guard(&self.recovered.custody.directory)? {
            return Err(Error::Contract("generation operational marker changed during check"));
        }
        Ok(())
    }
}
