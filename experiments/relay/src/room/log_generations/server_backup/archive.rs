//! Owned admitted components; a complete encoded joined buffer is not retained as well.
use super::super::ServerLogGenerationBackup;
use super::{ServerLogGenerationRoomBackupIdentity, format::Header};
use crate::assets::AssetStoreBackup;

/// Immutable joined native/raster source. Admission is not native replay, provider coverage or
/// permission to activate another service. Client journals/outboxes remain separate inputs.
pub struct ServerLogGenerationRoomBackup {
    pub(super) header: Header,
    pub(super) native: ServerLogGenerationBackup,
    pub(super) assets: AssetStoreBackup,
    pub(super) identity: ServerLogGenerationRoomBackupIdentity,
}
impl ServerLogGenerationRoomBackup {
    pub(in crate::room::log_generations) fn native(&self) -> &ServerLogGenerationBackup {
        &self.native
    }
    pub(in crate::room::log_generations) fn rasters(&self) -> &AssetStoreBackup {
        &self.assets
    }
}
