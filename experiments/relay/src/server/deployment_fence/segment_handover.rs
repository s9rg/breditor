//! Exact source comparison and the replacement append share real epoch custody.
use super::{
    RoomDeploymentAuthority, RoomDeploymentLease, RoomDeploymentSelection, journal, permit::Permit,
};
use crate::{
    Error, RecoveredRelaySegmentRoom, Result,
    server::{
        Host, RelaySegmentHandoverApproval, VerifiedRelaySegmentHandoverInputs,
        generation_backup::durable::{Interruption, Point},
    },
};
use std::io::sink;

pub(in crate::server) fn commit_segment_handover(
    host: &Host,
    principal: &str,
    target: &RecoveredRelaySegmentRoom,
    approval: &RelaySegmentHandoverApproval,
    inputs: Option<&VerifiedRelaySegmentHandoverInputs>,
    stop: &Interruption,
) -> Result<RoomDeploymentLease> {
    approval.check_inputs(inputs)?;
    host.deployment.fenced(|old| {
        if old.selection() != *approval.previous_selection() {
            return Err(Error::Lease);
        }
        let authority = old.authority();
        let mut epoch = Permit::try_acquire(&authority.state, true)?;
        old.check_held(&mut epoch)?;
        approval.check_target(target)?;
        let provider = if let Some(inputs) = inputs {
            Some(inputs.recheck(principal, target)?)
        } else {
            target.check_fresh_handover_target()?;
            None
        };
        if let Some(custody) = &host.relay_segment_custody {
            custody.check()?;
            custody.check_alternate_continuity(target)?;
        }
        let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
        let assets = host.assets.as_ref().ok_or(Error::NeedsRecovery)?;
        let assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
        let (current, source_rasters) = room.write_relay_segment_room_backup_with_custody(
            principal,
            &assets,
            &mut sink(),
            &mut sink(),
            &mut sink(),
        )?;
        if current != *approval.backup() {
            return Err(Error::Contract("relay segment handover source cut changed"));
        }
        if let Some(custody) = &host.relay_segment_custody {
            custody.check()?;
        }
        old.check_held(&mut epoch)?;
        stop.after(Point::SourceChecked)?;
        if let Some(provider) = &provider {
            // The predecessor comparison can take time. Recheck provider authority and
            // mappings, then check both native/raster owners without further callbacks.
            provider.check()?;
            source_rasters.check()?;
            room.recovery_inventory_owner(principal)?;
            if let Some(custody) = &host.relay_segment_custody {
                custody.check()?;
            }
            approval.check_target(target)?;
            old.check_held(&mut epoch)?;
        }
        let lease = authority.claim_activation_held(
            &mut epoch,
            approval.previous_selection(),
            approval.nonce()?,
            stop,
        )?;
        old.close();
        let result = (|| {
            if lease.selection() != approval.planned_selection()? {
                return Err(Error::NeedsRecovery);
            }
            stop.after(Point::EpochSynced)?;
            approval.check_target(target)?;
            target.check_fresh_handover_target()?;
            epoch.finish()?;
            authority.state.healthy()
        })();
        if result.is_err() {
            lease.close();
        }
        result?;
        Ok(lease)
    })
}

pub(in crate::server) fn resume_segment_handover(
    authority: &RoomDeploymentAuthority,
    target: &RecoveredRelaySegmentRoom,
    approval: &RelaySegmentHandoverApproval,
    expected: &RoomDeploymentSelection,
) -> Result<RoomDeploymentLease> {
    let first = approval.planned_selection()?;
    let generation = expected.validate_pin()?;
    let first_generation = first.validate_pin()?;
    if expected.identity != first.identity
        || authority.identity() != first.identity
        || generation < first_generation
    {
        return Err(Error::Lease);
    }
    if first.identity.requires_coordinated_recovery()
        && authority.state.cold_floor.is_none_or(|floor| floor < first_generation)
    {
        return Err(Error::Contract("coordinated relay restart requires a retained epoch"));
    }
    let owner = if generation == first_generation {
        first.owner.clone()
    } else {
        Some(journal::nonce(&approval.restart_nonce(generation)?))
    };
    if expected.owner != owner {
        return Err(Error::Lease);
    }
    let mut epoch = Permit::try_acquire(&authority.state, true)?;
    let current = authority.state.selected(epoch.file()?)?;
    if current.selection != *expected {
        return Err(Error::Lease);
    }
    journal::retains_selection(
        epoch.file()?,
        &authority.state.header_digest,
        authority.state.offset,
        &current,
        &first,
    )?;
    approval.check_target(target)?;
    target.check_handover_client_rasters()?;
    let lease = authority.claim_handover_held(
        &mut epoch,
        expected,
        approval.restart_nonce(generation + 1)?,
    )?;
    epoch.finish()?;
    authority.state.healthy()?;
    Ok(lease)
}
