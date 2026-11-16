//! Compare both live source generations and fresh recovery inputs under the actual write fence.
use super::{RoomDeploymentLease, permit::Permit};
use crate::{
    Error, Result,
    server::{
        Authentication, ContinuedRasterActivation, Host, RecoveredContinuedRasterRoom,
        backup::check_server_asset_mappings,
        generation_backup::durable::{Interruption, Point},
    },
};
use std::io::sink;

pub(in crate::server) fn activate_continued_raster(
    host: &Host,
    authentication: &Authentication,
    principal: &str,
    token: &str,
    target: &mut RecoveredContinuedRasterRoom,
    selected: &ContinuedRasterActivation<'_>,
    stop: &Interruption,
) -> Result<RoomDeploymentLease> {
    let approval = selected.approval;
    let planned = approval.planned_selection()?;
    approval.check_target(target)?;
    host.deployment.fenced(|old| {
        if old.selection() != *approval.previous() {
            return Err(Error::Lease);
        }
        let authority = old.authority();
        let mut epoch = Permit::try_acquire(&authority.state, true)?;
        old.check_held(&mut epoch)?;

        let inputs = target.verify_recovery_inputs(
            authentication,
            principal,
            token,
            selected.credentials,
            selected.provider,
        )?;
        approval.check_inputs(&inputs)?;
        let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
        if let Some(custody) = &host.continued_custody {
            custody.check(&room)?;
            custody.check_retained_alternates(target)?;
        }
        let rasters = host
            .continued_assets
            .as_ref()
            .ok_or(Error::NeedsRecovery)?
            .lock()
            .map_err(|_| Error::NeedsRecovery)?;
        let native = room.write_relay_segment_base_with_compactable_history(
            principal,
            &mut sink(),
            &mut sink(),
        )?;
        if native != inputs.backup.native
            || rasters.write_backup(&mut sink(), &mut sink())? != inputs.backup.rasters
        {
            return Err(Error::Contract("continued raster activation live source advanced"));
        }

        stop.after(Point::SourceChecked)?;
        target.check_exact_restored_cut()?;
        check_server_asset_mappings(selected.provider, &inputs.resolutions)?;
        rasters.guard()?;
        room.recovery_inventory_owner(principal)?;
        if let Some(custody) = &host.continued_custody {
            custody.check(&room)?;
        }
        target.check_exact_restored_cut()?;
        old.check_held(&mut epoch)?;
        let lease = authority.claim_activation_held(
            &mut epoch,
            approval.previous(),
            approval.nonce()?,
            stop,
        )?;
        old.close();
        let confirmed = (|| {
            if lease.selection() != planned {
                return Err(Error::NeedsRecovery);
            }
            stop.after(Point::EpochSynced)?;
            target.check_exact_restored_cut()?;
            epoch.finish()?;
            authority.state.healthy()
        })();
        if confirmed.is_err() {
            lease.close();
        }
        confirmed?;
        Ok(lease)
    })
}
