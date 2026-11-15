//! Select a fresh serving extent using the actual source seal and complete target proof.
use super::{RoomDeploymentLease, permit::Permit};
use crate::{Error, RecoveredRelaySegmentRoom, Result, server::SealedRelaySegmentActivation};

pub(in crate::server) fn activate_portable_segment(
    target: &RecoveredRelaySegmentRoom,
    principal: &str,
    selection: &SealedRelaySegmentActivation<'_>,
) -> Result<RoomDeploymentLease> {
    let SealedRelaySegmentActivation { authority, seal, approval, inputs } = *selection;
    let previous = seal.planned_selection()?;
    if authority.identity() != previous.identity || approval.previous_selection() != &previous {
        return Err(Error::Lease);
    }
    let expected = &seal.backup().retained;
    if approval.backup() != &expected.backup {
        return Err(Error::Contract("sealed portable activation backup differs"));
    }
    approval.check_inputs(Some(inputs))?;
    let mut epoch = Permit::try_acquire(&authority.state, true)?;
    let selected = authority.state.selected(epoch.file()?)?;
    if selected.selection != previous {
        return Err(Error::Lease);
    }
    approval.check_target(target)?;
    target.check_portable_input_roster(expected)?;
    let provider = inputs.recheck(principal, target)?;
    provider.check()?;
    approval.check_target(target)?;
    target.check_portable_input_roster(expected)?;
    let lease = authority.claim_handover_held(&mut epoch, &previous, approval.nonce()?)?;
    let confirmed = (|| {
        if lease.selection() != approval.planned_selection()? {
            return Err(Error::NeedsRecovery);
        }
        approval.check_target(target)?;
        target.check_fresh_handover_target()?;
        epoch.finish()?;
        authority.state.healthy()
    })();
    if confirmed.is_err() {
        lease.close();
    }
    confirmed?;
    Ok(lease)
}
