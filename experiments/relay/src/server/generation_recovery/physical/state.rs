//! Three independent complete selections, not a reinterpretation of an original origin.
use crate::{
    Result, ServerLogGenerationParticipantIdentity, ServerLogGenerationParticipantInventory,
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
};
use serde::{Deserialize, Serialize};

/// Detached physical recovery selection. Metadata grants no authentication or native ownership.
/// The distinct family preserves ancestor A, actual local restore origin B and current cut C.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhysicalServerRoomRecoveryStateIdentity {
    /// Distinct family, currently breditor/physical-server-room-recovery-state.
    pub format: String,
    /// Closed revision, currently one.
    pub format_version: u32,
    /// Full separately retained ancestor archive, including original physical files and rasters.
    pub ancestor: ServerLogGenerationRoomBackupIdentity,
    /// The real archive selected by the actual local recovery/operational control markers.
    pub local_origin: ServerLogGenerationRoomBackupIdentity,
    /// Complete current native/raster cut, not just visible document/comment clocks.
    pub server: ServerLogGenerationRoomBackupIdentity,
    /// All current native protected streams bound to the whole current physical source.
    pub participants: ServerLogGenerationParticipantIdentity,
}
/// Authenticated capture under the actual native room-then-raster locks. Protected credentials,
/// every client/outbox, provider mappings and activation remain independent requirements.
pub struct PhysicalServerRoomRecoveryState {
    pub(super) ancestor: ServerLogGenerationRoomBackupIdentity,
    pub(super) local_origin: ServerLogGenerationRoomBackupIdentity,
    pub(super) server: ServerLogGenerationRoomBackup,
    pub(super) participants: ServerLogGenerationParticipantInventory,
}
impl PhysicalServerRoomRecoveryState {
    /// Return detached A/B/C pins, never a live proof or an activation decision.
    /// # Errors
    /// Refuses existing complete archive bounds.
    pub fn identity(&self) -> Result<PhysicalServerRoomRecoveryStateIdentity> {
        Ok(PhysicalServerRoomRecoveryStateIdentity {
            format: "breditor/physical-server-room-recovery-state".into(),
            format_version: 1,
            ancestor: self.ancestor.clone(),
            local_origin: self.local_origin.clone(),
            server: self.server.info()?.identity,
            participants: self.participants.identity(),
        })
    }
    /// Complete current archives/streams only. Neither supplies executable policy or secrets.
    #[must_use]
    pub fn into_parts(
        self,
    ) -> (ServerLogGenerationRoomBackup, ServerLogGenerationParticipantInventory) {
        (self.server, self.participants)
    }
}
