//! Complete live generation capture and fencing share the actual exclusive authority.
use super::{RoomDeploymentLease, RoomDeploymentSelection, permit::Permit};
use crate::{
    Error, Result, ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    server::Host,
};

pub(in crate::server) fn seal_log_generation(
    host: &Host,
    principal: &str,
    expected: &ServerLogGenerationRoomBackupIdentity,
) -> Result<(ServerLogGenerationRoomBackup, RoomDeploymentSelection, RoomDeploymentSelection)> {
    if host.generation_custody.is_some() {
        return Err(Error::Contract("joined generation original custody must be retained"));
    }
    host.deployment.fenced(|lease| seal_current(host, lease, principal, expected))
}
fn seal_current(
    host: &Host,
    lease: &RoomDeploymentLease,
    principal: &str,
    expected: &ServerLogGenerationRoomBackupIdentity,
) -> Result<(ServerLogGenerationRoomBackup, RoomDeploymentSelection, RoomDeploymentSelection)> {
    let authority = lease.authority();
    let mut held = Permit::try_acquire(&authority.state, true)?;
    lease.check_held(&mut held)?;
    let previous = lease.selection();
    // Never reenter Host::transaction while this exclusive permit is held.
    // Keep the actual source locks through comparison and durable epoch append.
    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
    let assets = host.assets.as_ref().ok_or(Error::Contract("generation source assets absent"))?;
    let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, principal)?;
    if &backup.info()?.identity != expected {
        return Err(Error::Contract("generation handover source cut changed"));
    }
    lease.check_held(&mut held)?;
    let next = authority.claim_held(&mut held, &previous)?;
    next.close();
    let sealed = next.selection();
    drop(assets);
    drop(room);
    held.finish()?;
    authority.state.healthy()?;
    Ok((backup, previous, sealed))
}
