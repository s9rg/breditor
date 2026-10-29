//! Immutable durable intent, complete actual source and append share one exclusion.
use super::{RoomDeploymentLease, permit::Permit};
use crate::{
    Error, Result, ServerLogGenerationRoomBackup,
    server::{
        Host,
        generation_backup::durable::{Interruption, Point, PreparedLogGenerationHandover},
    },
};
pub(in crate::server) fn seal_prepared(
    host: &Host,
    principal: &str,
    prepared: &PreparedLogGenerationHandover,
    stop: &Interruption,
) -> Result<()> {
    if host.generation_custody.is_some() {
        return Err(Error::Contract("joined generation original custody must be retained"));
    }
    host.deployment.fenced(|lease| seal_current(host, lease, principal, prepared, stop))
}
fn seal_current(
    host: &Host,
    lease: &RoomDeploymentLease,
    principal: &str,
    prepared: &PreparedLogGenerationHandover,
    stop: &Interruption,
) -> Result<()> {
    let authority = lease.authority();
    let mut held = Permit::try_acquire(&authority.state, true)?;
    lease.check_held(&mut held)?;
    prepared.store.guard()?;
    let identity = prepared.identity();
    if lease.selection() != identity.previous {
        return Err(Error::Lease);
    }
    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
    let assets = host.assets.as_ref().ok_or(Error::Contract("generation source assets absent"))?;
    let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
    let backup = ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, principal)?;
    if backup.info()?.identity != identity.source {
        return Err(Error::Contract("prepared handover source cut changed"));
    }
    lease.check_held(&mut held)?;
    prepared.store.guard()?;
    stop.after(Point::SourceChecked)?;
    prepared.store.guard()?;
    backup.check_live(&mut room, &assets, principal)?;
    lease.check_held(&mut held)?;
    let sealed = authority.claim_handover_held(&mut held, &identity.previous, identity.nonce()?)?;
    sealed.close();
    if sealed.selection() != identity.sealed {
        return Err(Error::NeedsRecovery);
    }
    stop.after(Point::EpochSynced)?;
    prepared.store.guard()?;
    drop(assets);
    drop(room);
    held.finish()?;
    authority.state.healthy()
}
