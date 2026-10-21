//! Complete original and current physical server pins, never projected to an original-only cut.
use crate::{
    ServerLogGenerationParticipantIdentity, ServerLogGenerationParticipantInventory,
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
};
use serde::{Deserialize, Serialize};

/// Independently select complete original and current server archives plus every current stream.
/// These serializable identities grant no authentication, custody, provider or activation rights.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerLogGenerationRecoveryStateIdentity {
    /// Original complete joined recovery selection, including its original physical manifest.
    pub origin: ServerLogGenerationRoomBackupIdentity,
    /// Complete current native/raster archive, not merely current document/comment clocks.
    pub server: ServerLogGenerationRoomBackupIdentity,
    /// Every current native registration, bound to this same whole current native archive.
    pub participants: ServerLogGenerationParticipantIdentity,
}
/// Exact native capture under current owner authentication and the host's serialized owners.
/// Raw protected registrations, all client/outbox copies and provider availability stay separate.
pub struct ServerLogGenerationRecoveryState {
    pub(super) origin: ServerLogGenerationRoomBackupIdentity,
    pub(super) server: ServerLogGenerationRoomBackup,
    pub(super) participants: ServerLogGenerationParticipantInventory,
}
impl ServerLogGenerationRecoveryState {
    /// Detached original/current pins, not a live host or authority proof.
    /// # Errors
    /// Refuses internal complete archive bounds.
    pub fn identity(&self) -> crate::Result<ServerLogGenerationRecoveryStateIdentity> {
        Ok(ServerLogGenerationRecoveryStateIdentity {
            origin: self.origin.clone(),
            server: self.server.info()?.identity,
            participants: self.participants.identity(),
        })
    }
    /// Complete unchanged archive and generation inventory. Neither supplies executable host
    /// recovery policy, raw registration secrets, provider mappings or permission to activate.
    #[must_use]
    pub fn into_parts(
        self,
    ) -> (ServerLogGenerationRoomBackup, ServerLogGenerationParticipantInventory) {
        (self.server, self.participants)
    }
}
