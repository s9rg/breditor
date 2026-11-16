//! Compare both live source generations and fresh recovery inputs under the actual write fence.
use super::{RoomDeploymentLease, continued_source_cut::ContinuedSourceCut, permit::Permit};
use crate::{
    Error, Result,
    server::{
        Authentication, ContinuedRasterActivation, Host, RecoveredContinuedRasterRoom,
        backup::check_server_asset_mappings,
        generation_backup::durable::{Interruption, Point},
    },
};

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
    approval.check_live_source()?;
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
        let source = ContinuedSourceCut::compare(host, principal, &inputs.backup, target)?;
        stop.after(Point::SourceChecked)?;
        target.check_exact_restored_cut()?;
        check_server_asset_mappings(selected.provider, &inputs.resolutions)?;
        source.check(principal)?;
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
