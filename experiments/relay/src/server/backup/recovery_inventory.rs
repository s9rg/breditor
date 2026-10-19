//! Owner-authenticated private capture and credential checks. No route or activation is added.
use super::ServerBackupHandle;
use crate::{
    Error, RecoveryRegistrationCoverage, RecoveryRegistrationCredentials, Result,
    RoomParticipantInventory, RoomParticipantInventoryIdentity, ServerRoomBackup,
    ServerRoomBackupIdentity,
};
use serde::{Deserialize, Serialize};

/// Independently selected original server bundle and complete registration inventory.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerRecoveryStateIdentity {
    /// Exact complete original log/raster file.
    pub server: ServerRoomBackupIdentity,
    /// Exact native registration inventory at that same original room-log cut.
    pub participants: RoomParticipantInventoryIdentity,
}

/// Owner-authenticated serialized native capture. Current auth, protected raw registration
/// inputs, declared client databases and deployment fencing remain separate host obligations.
pub struct ServerRecoveryState {
    server: ServerRoomBackup,
    participants: RoomParticipantInventory,
}
impl ServerRecoveryState {
    /// Independently retain both exact files' selected identity before later recovery.
    #[must_use]
    pub fn identity(&self) -> ServerRecoveryStateIdentity {
        ServerRecoveryStateIdentity {
            server: self.server.info().identity,
            participants: self.participants.identity(),
        }
    }
    /// Transfer the unchanged original server archive and immutable canonical inventory file.
    /// Neither component starts a service, reads raw credentials or grants account access.
    #[must_use]
    pub fn into_parts(self) -> (ServerRoomBackup, RoomParticipantInventory) {
        (self.server, self.participants)
    }
}

impl ServerBackupHandle {
    /// Authenticate an existing owner account and capture server data plus every registration
    /// under the ordinary room-then-assets transaction locks. No credential is saved in metadata.
    /// # Errors
    /// Rejects missing/wrong account authentication, non-owner callers, changed native storage,
    /// absent/mismatched raster storage, or existing archive/inventory admission limits.
    pub async fn capture_recovery_state(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<ServerRecoveryState> {
        self.host.authentication.authenticate(principal, token)?;
        let principal = principal.to_owned();
        let assets =
            self.host.assets.clone().ok_or(Error::Contract("server recovery assets absent"))?;
        self.host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                let participants = room.participant_inventory(&principal)?;
                let server = ServerRoomBackup::capture(room, &mut assets)?;
                if participants.identity().room != server.info().identity.room {
                    return Err(Error::Contract("server and participant cuts differ"));
                }
                Ok(ServerRecoveryState { server, participants })
            })
            .await
    }

    /// Authenticate the owner and verify protected original secrets against this actual live cut.
    /// This does not resume a stream, replace a lease, acknowledge work or restore account roles.
    /// # Errors
    /// Rejects bad owner authentication, stale/fabricated inventory, unknown/duplicate/foreign
    /// registrations and malformed/wrong credentials. Missing records return Pending, not a proof.
    pub async fn verify_recovery_registrations(
        &self,
        principal: &str,
        token: &str,
        inventory: RoomParticipantInventory,
        supplied: RecoveryRegistrationCredentials,
    ) -> Result<RecoveryRegistrationCoverage> {
        self.host.authentication.authenticate(principal, token)?;
        let principal = principal.to_owned();
        self.host
            .transaction(move |room| inventory.verify_registrations(room, &principal, &supplied))
            .await
    }
}
