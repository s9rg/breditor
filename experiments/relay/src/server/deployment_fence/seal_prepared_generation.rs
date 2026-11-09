//! Immutable durable intent, complete actual source and append share one exclusion.
use super::{RoomDeploymentLease, permit::Permit};
use crate::{
    Error, Result, Room, ServerLogGenerationRoomBackup,
    assets::AssetStore,
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
    seal_prepared_source(
        host,
        prepared,
        stop,
        |room, assets| ServerLogGenerationRoomBackup::capture(room, assets, principal),
        |backup, room, assets| backup.check_live(room, assets, principal),
    )
}

pub(in crate::server) fn seal_prepared_source(
    host: &Host,
    prepared: &PreparedLogGenerationHandover,
    stop: &Interruption,
    capture: impl FnOnce(&mut Room, &mut AssetStore) -> Result<ServerLogGenerationRoomBackup>,
    check: impl FnOnce(&ServerLogGenerationRoomBackup, &mut Room, &AssetStore) -> Result<()>,
) -> Result<()> {
    if host.generation_custody.is_some() {
        return Err(Error::Contract("joined generation original custody must be retained"));
    }
    host.deployment.fenced(|lease| seal_current(host, lease, prepared, stop, capture, check))
}
fn seal_current(
    host: &Host,
    lease: &RoomDeploymentLease,
    prepared: &PreparedLogGenerationHandover,
    stop: &Interruption,
    capture: impl FnOnce(&mut Room, &mut AssetStore) -> Result<ServerLogGenerationRoomBackup>,
    check: impl FnOnce(&ServerLogGenerationRoomBackup, &mut Room, &AssetStore) -> Result<()>,
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
    let backup = capture(&mut room, &mut assets)?;
    if backup.info()?.identity != identity.source {
        return Err(Error::Contract("prepared handover source cut changed"));
    }
    lease.check_held(&mut held)?;
    prepared.store.guard()?;
    stop.after(Point::SourceChecked)?;
    prepared.store.guard()?;
    check(&backup, &mut room, &assets)?;
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
