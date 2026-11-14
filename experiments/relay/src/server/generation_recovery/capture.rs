//! Current capture and retained-origin checks share actual room-then-raster transaction locks.
use super::ServerLogGenerationRecoveryStateIdentity;
use super::{PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryState};
use crate::{
    Error, Result, Room, ServerLogGenerationParticipantInventory, ServerLogGenerationRoomBackup,
    assets::AssetStore,
    room::{GenerationOperationCustody, HostOrigin},
};
use std::{
    fs::File,
    io::{self, Write},
};
pub(super) fn capture_state(
    room: &mut Room,
    assets: &mut AssetStore,
    original: &crate::room::HostOrigin,
    custody: &crate::room::GenerationOperationCustody,
    principal: &str,
) -> Result<ServerLogGenerationRecoveryState> {
    custody.check_source(room, assets, original, principal)?;
    let server = ServerLogGenerationRoomBackup::capture(room, assets, principal)?;
    let participants =
        room.capture_generation_inventory_at(principal, server.info()?.identity.native)?;
    server.check_live(room, assets, principal)?;
    custody.check_source(room, assets, original, principal)?;
    Ok(ServerLogGenerationRecoveryState {
        origin: original.identity()?.clone(),
        server,
        participants,
    })
}
pub(super) fn capture_identity(
    room: &mut Room,
    assets: &mut AssetStore,
    original: &HostOrigin,
    custody: &GenerationOperationCustody,
    principal: &str,
    output: &mut impl Write,
) -> Result<(ServerLogGenerationRecoveryStateIdentity, ServerLogGenerationParticipantInventory)> {
    custody.check_source(room, assets, original, principal)?;
    let origin = original.identity()?.clone();
    let server =
        ServerLogGenerationRoomBackup::capture_to(room, assets, principal, output)?.identity;
    let participants = room.capture_generation_inventory_at(principal, server.native.clone())?;
    // The transaction holds both owners. Recheck the complete physical cut after reading the
    // native registration inventory, including immutable raster and unpublished file bytes.
    if ServerLogGenerationRoomBackup::capture_to(room, assets, principal, &mut io::sink())?.identity
        != server
    {
        return Err(Error::Contract("generation host capture cuts differ"));
    }
    custody.check_source(room, assets, original, principal)?;
    Ok((
        ServerLogGenerationRecoveryStateIdentity {
            origin,
            server,
            participants: participants.identity(),
        },
        participants,
    ))
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

    /// Capture exact current selection and participant inventory without retaining an archive.
    /// Use a separately retained exact backup to restore the selected cut.
    /// # Errors
    /// Wrong credentials, changed custody or data, or existing bounds refuse.
    pub async fn capture_recovery_identity(
        &self,
        principal: &str,
        token: &str,
    ) -> Result<(ServerLogGenerationRecoveryStateIdentity, ServerLogGenerationParticipantInventory)>
    {
        self.capture_with_output(principal, token, || Ok(io::sink())).await
    }

    /// Stream the exact joined current archive into a caller-owned, empty output file and return
    /// its independently retainable selection and inventory. Retain a handle for sync and publish
    /// after success. Discard partial output on error. The call seeks to offset zero.
    /// # Errors
    /// Wrong credentials, custody, inconsistent capture or destination errors refuse.
    pub async fn capture_recovery_state_to(
        &self,
        principal: &str,
        token: &str,
        output: File,
    ) -> Result<(ServerLogGenerationRecoveryStateIdentity, ServerLogGenerationParticipantInventory)>
    {
        self.capture_with_output(principal, token, move || {
            use std::io::{Seek, SeekFrom};
            let mut output = output;
            let metadata = output.metadata()?;
            if !metadata.is_file() || metadata.len() != 0 {
                return Err(Error::Contract("generation capture requires an empty output file"));
            }
            output.seek(SeekFrom::Start(0))?;
            Ok(output)
        })
        .await
    }

    async fn capture_with_output<W: Write>(
        &self,
        principal: &str,
        token: &str,
        output: impl FnOnce() -> Result<W> + Send + 'static,
    ) -> Result<(ServerLogGenerationRecoveryStateIdentity, ServerLogGenerationParticipantInventory)>
    {
        self.host.authentication.authenticate(principal, token)?;
        let owner = principal.to_owned();
        let original = self.original.clone();
        let custody = self.host.generation_custody.clone().ok_or(Error::NeedsRecovery)?;
        let assets = self.host.assets.clone().ok_or(Error::NeedsRecovery)?;
        self.host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                capture_identity(room, &mut assets, &original, &custody, &owner, &mut output()?)
            })
            .await
    }
}
