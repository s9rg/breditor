//! Current capture and retained-origin checks share actual room-then-raster transaction locks.
use super::{PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryState};
use crate::{Error, Result, Room, ServerLogGenerationRoomBackup, assets::AssetStore};
pub(super) fn capture_state(
    room: &mut Room,
    assets: &mut AssetStore,
    original: &ServerLogGenerationRoomBackup,
    custody: &crate::room::GenerationOperationCustody,
    principal: &str,
) -> Result<ServerLogGenerationRecoveryState> {
    custody.check_source(room, assets, original, principal)?;
    let participants = room.log_generation_participant_inventory(principal)?;
    let server = ServerLogGenerationRoomBackup::capture(room, assets, principal)?;
    if participants.identity().source != server.info()?.identity.native {
        return Err(Error::Contract("generation host capture cuts differ"));
    }
    custody.check_source(room, assets, original, principal)?;
    Ok(ServerLogGenerationRecoveryState { origin: original.info()?.identity, server, participants })
}
impl PreparedLogGenerationRecoveryHost {
    /// Authenticate a current owner and capture complete native/raster history plus every current
    /// registration. Recheck retained original history and actual directory custody in the same
    /// transaction. No client input, grant, connection, upload or acknowledgement is changed.
    /// # Errors
    /// Wrong current authentication/non-owner, absent/changed custody, lost original history,
    /// inconsistent physical selections, uncertain native storage or existing bounds refuse.
    pub async fn capture_recovery_state(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<ServerLogGenerationRecoveryState> {
        self.host.authentication.authenticate(principal, token)?;
        let principal = principal.to_owned();
        let original = self.original.clone();
        let custody = self
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("generation host custody absent"))?;
        let assets =
            self.host.assets.clone().ok_or(Error::Contract("generation host assets absent"))?;
        self.host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                capture_state(room, &mut assets, &original, &custody, &principal)
            })
            .await
    }
}
