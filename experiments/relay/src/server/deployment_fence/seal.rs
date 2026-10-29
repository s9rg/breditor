//! Exact accepted native/raster capture and old-writer fencing share ONE exclusion.
use super::{RoomDeploymentLease, RoomDeploymentSelection, permit::Permit};
use crate::{Error, Result, ServerRoomBackup, ServerRoomBackupIdentity, server::Host};

pub(in crate::server) fn seal(
    host: &Host,
    expected: &ServerRoomBackupIdentity,
) -> Result<(ServerRoomBackup, RoomDeploymentSelection, RoomDeploymentSelection)> {
    host.deployment.fenced(|lease| seal_current(host, lease, expected))
}
fn seal_current(
    host: &Host,
    lease: &RoomDeploymentLease,
    expected: &ServerRoomBackupIdentity,
) -> Result<(ServerRoomBackup, RoomDeploymentSelection, RoomDeploymentSelection)> {
    let authority = lease.authority();
    let mut held = Permit::try_acquire(&authority.state, true)?;
    lease.check_held(&mut held)?;
    let previous = lease.selection();
    // Do NOT call Host::transaction here: its shared permit would reenter the
    // same authority mutex. The global order stays deployment -> room -> assets.
    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
    let assets = host.assets.as_ref().ok_or(Error::Contract("source rasters absent"))?;
    let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
    let backup = ServerRoomBackup::capture(&mut room, &mut assets)?;
    if &backup.info().identity != expected {
        return Err(Error::Contract("handover source cut changed"));
    }
    // No caller/provider callback splits the native comparison from this
    // synced fence. The new epoch is deliberately NEVER a serving grant.
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
