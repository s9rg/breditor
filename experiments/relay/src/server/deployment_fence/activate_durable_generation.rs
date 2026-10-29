//! Exact durable target cut and real operational owner precede a fresh native lease.
use super::{RoomDeploymentAuthority, RoomDeploymentSelection, journal, permit::Permit};
use crate::{
    Error, Result,
    server::{
        generation_backup::durable::{Interruption, Point},
        generation_recovery::{
            NativeGenerationServingCustody, PreparedLogGenerationRecoveryHost,
            PreparedNativeGenerationActivation, VerifiedServerLogGenerationRecoveryState,
            check_generation_selected,
        },
    },
};
use std::sync::Arc;
pub(in crate::server) fn activate_durable_native_generation(
    handle: &PreparedLogGenerationRecoveryHost,
    principal: &str,
    authority: &RoomDeploymentAuthority,
    prepared: &Arc<PreparedNativeGenerationActivation>,
    verified: &VerifiedServerLogGenerationRecoveryState,
    stop: &Interruption,
) -> Result<RoomDeploymentSelection> {
    verified.check_host(handle, principal)?;
    prepared.guard()?;
    let current = verified.identity();
    let decision = prepared.identity();
    if decision.current() != &current || decision.source() != prepared.source.identity() {
        return Err(Error::Contract("durable native activation selected target differs"));
    }
    let host = &handle.host;
    let custody = host.generation_custody.as_ref().ok_or(Error::NeedsRecovery)?;
    let assets = host.assets.as_ref().ok_or(Error::NeedsRecovery)?;
    host.deployment.activate(|slot| {
        if host.generation_serving.get().is_some()
            || authority.identity() != decision.previous_selection().identity
        {
            return Err(Error::Contract("durable native activation owner or authority differs"));
        }
        let mut epoch = Permit::try_acquire(&authority.state, true)?;
        let selected = authority.state.selected(epoch.file()?)?;
        if selected.selection != *decision.previous_selection() {
            return Err(Error::Lease);
        }
        journal::retains_selection(
            epoch.file()?,
            &authority.state.header_digest,
            authority.state.offset,
            &selected,
            prepared.source.identity().planned_selection(),
        )?;
        prepared.guard()?;
        let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
        let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
        if custody.activation_owner_digest()? != decision.operation()
            || room.deployment_binding()? != authority.identity().binding
        {
            return Err(Error::Contract(
                "durable native activation actual operational owner differs",
            ));
        }
        check_generation_selected(
            &mut room,
            &mut assets,
            &handle.original,
            custody,
            principal,
            &current,
        )?;
        prepared.checkpoint().check_live(&mut room, &assets, principal)?;
        stop.after(Point::SourceChecked)?;
        prepared.guard()?;
        check_generation_selected(
            &mut room,
            &mut assets,
            &handle.original,
            custody,
            principal,
            &current,
        )?;
        host.generation_serving
            .set(NativeGenerationServingCustody {
                original: handle.original.clone(),
                source: prepared.source.clone(),
                checkpoint: Some(prepared.clone()),
            })
            .map_err(|_| Error::NeedsRecovery)?;
        slot.begin_commit();
        let lease = authority.claim_activation_held(
            &mut epoch,
            decision.previous_selection(),
            decision.nonce()?,
            stop,
        )?;
        slot.publish(lease.clone());
        let result = (|| {
            if lease.selection() != *decision.planned_selection() {
                return Err(Error::NeedsRecovery);
            }
            stop.after(Point::EpochSynced)?;
            prepared.guard()?;
            check_generation_selected(
                &mut room,
                &mut assets,
                &handle.original,
                custody,
                principal,
                &current,
            )?;
            drop(assets);
            drop(room);
            epoch.finish()?;
            authority.state.healthy()?;
            slot.finish()?;
            Ok(lease.selection())
        })();
        if result.is_err() {
            lease.close();
        }
        result
    })
}
