//! One-time native-only activation retains real recovery and original-source owners.
use super::{RoomDeploymentAuthority, RoomDeploymentSelection, permit::Permit};
use crate::{
    Error, Result,
    server::{
        generation_backup::durable::{Interruption, Point, PreparedLogGenerationHandover},
        generation_recovery::{
            NativeGenerationServingCustody, NativeLogGenerationActivationIdentity,
            PreparedLogGenerationRecoveryHost, VerifiedServerLogGenerationRecoveryState,
            check_generation_selected,
        },
    },
};
use std::sync::Arc;

pub(in crate::server) fn activate_native_generation(
    handle: &PreparedLogGenerationRecoveryHost,
    principal: &str,
    authority: &RoomDeploymentAuthority,
    source: &Arc<PreparedLogGenerationHandover>,
    verified: &VerifiedServerLogGenerationRecoveryState,
    expected: &NativeLogGenerationActivationIdentity,
    stop: &Interruption,
) -> Result<RoomDeploymentSelection> {
    verified.check_host(handle, principal)?;
    let current = verified.identity();
    if NativeLogGenerationActivationIdentity::new(source.identity().clone(), current.clone())?
        != *expected
    {
        return Err(Error::Contract("native activation selected decision differs"));
    }
    let host = &handle.host;
    let custody = host.generation_custody.as_ref().ok_or(Error::NeedsRecovery)?;
    let assets = host.assets.as_ref().ok_or(Error::NeedsRecovery)?;
    host.deployment.activate(|slot| {
        if host.generation_serving.get().is_some()
            || authority.identity() != source.identity().planned_selection().identity
        {
            return Err(Error::Contract(
                "native activation owner already attached or authority differs",
            ));
        }
        let mut epoch = Permit::try_acquire(&authority.state, true)?;
        let selected = authority.state.selected(epoch.file()?)?;
        if selected.selection != *source.identity().planned_selection() {
            return Err(Error::Lease);
        }
        source.store.guard()?;
        let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
        let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
        if room.deployment_binding()? != authority.identity().binding {
            return Err(Error::Contract("deployment native binding"));
        }
        check_generation_selected(
            &mut room,
            &mut assets,
            &handle.original,
            custody,
            principal,
            &current,
        )?;
        stop.after(Point::SourceChecked)?;
        source.store.guard()?;
        check_generation_selected(
            &mut room,
            &mut assets,
            &handle.original,
            custody,
            principal,
            &current,
        )?;
        // Retain the actual original and source owners BEFORE an append can
        // become durable without returning a lease. Every failure from here
        // leaves all earlier clones retired, even while their lease is None.
        host.generation_serving
            .set(NativeGenerationServingCustody {
                original: handle.original.clone(),
                source: source.clone(),
                checkpoint: None,
            })
            .map_err(|_| Error::NeedsRecovery)?;
        slot.begin_commit();
        let lease = authority.claim_activation_held(
            &mut epoch,
            source.identity().planned_selection(),
            expected.nonce()?,
            stop,
        )?;
        // Publication is irreversible once the append may be durable. Any later
        // failure closes this same lease but never restores an unfenced slot.
        slot.publish(lease.clone());
        let postcheck = (|| {
            if lease.selection() != *expected.planned_selection() {
                return Err(Error::NeedsRecovery);
            }

            stop.after(Point::EpochSynced)?;
            source.store.guard()?;
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
        if postcheck.is_err() {
            lease.close();
        }
        postcheck
    })
}
