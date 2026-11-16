//! Commit a no-serving source seal and then admit its relocated, independently approved target.
use super::{
    RoomDeploymentLease, RoomDeploymentSelection, continued_source_cut::ContinuedSourceCut,
    permit::Permit,
};
use crate::{
    Error, Result,
    server::{
        Authentication, ContinuedRasterRoomBackupFiles, ContinuedRasterSealing, Host,
        RecoveredContinuedRasterRoom, SealedContinuedRasterActivation,
        backup::check_server_asset_mappings,
        generation_backup::durable::{Interruption, Point},
    },
};

pub(in crate::server) fn seal_continued_raster(
    host: &Host,
    principal: &str,
    token: &str,
    backup: &ContinuedRasterRoomBackupFiles,
    preflight: &mut RecoveredContinuedRasterRoom,
    selected: &ContinuedRasterSealing<'_>,
    stop: &Interruption,
) -> Result<RoomDeploymentSelection> {
    let expected = selected.seal.backup();
    let planned = selected.seal.planned_selection()?;
    if backup.selection() != expected || preflight.activation_backup() != expected {
        return Err(Error::Contract("continued raster portable seal backup differs"));
    }
    host.deployment.fenced(|old| {
        if old.selection() != expected.source_epoch {
            return Err(Error::Lease);
        }
        let authority = old.authority();
        let mut epoch = Permit::try_acquire(&authority.state, true)?;
        old.check_held(&mut epoch)?;
        backup.check()?;
        let report = preflight.verify_recovery_inputs(
            &host.authentication,
            principal,
            token,
            selected.credentials,
            selected.provider,
        )?;
        selected.seal.check_report(&report)?;
        let source = ContinuedSourceCut::compare(host, principal, expected, preflight)?;
        stop.after(Point::SourceChecked)?;
        check_server_asset_mappings(selected.provider, &report.resolutions)?;
        backup.check()?;
        preflight.check_exact_restored_cut()?;
        source.check(principal)?;
        old.check_held(&mut epoch)?;
        let seal = authority.claim_activation_held(
            &mut epoch,
            &expected.source_epoch,
            selected.seal.nonce()?,
            stop,
        )?;
        old.close();
        seal.close();
        if seal.selection() != planned {
            return Err(Error::NeedsRecovery);
        }
        stop.after(Point::EpochSynced)?;
        epoch.finish()?;
        authority.state.healthy()?;
        Ok(planned)
    })
}

pub(in crate::server) fn activate_sealed_continued_raster(
    target: &mut RecoveredContinuedRasterRoom,
    authentication: &Authentication,
    principal: &str,
    token: &str,
    selection: &SealedContinuedRasterActivation<'_>,
) -> Result<RoomDeploymentLease> {
    let sealed = selection.seal.planned_selection()?;
    let authority = selection.authority;
    let selected = &selection.target;
    let approval = selected.approval;
    approval.check_sealed_source(selection.seal)?;
    approval.check_target(target)?;
    let generation = sealed.validate_pin()?;
    if authority.identity() != sealed.identity
        || authority.state.cold_floor.is_none_or(|floor| floor < generation)
    {
        return Err(Error::Contract("continued raster activation requires retained sealed epoch"));
    }
    let mut epoch = Permit::try_acquire(&authority.state, true)?;
    if authority.state.selected(epoch.file()?)?.selection != sealed {
        return Err(Error::Lease);
    }

    let report = target.verify_recovery_inputs(
        authentication,
        principal,
        token,
        selected.credentials,
        selected.provider,
    )?;
    selection.seal.check_report(&report)?;
    approval.check_inputs(&report)?;
    check_server_asset_mappings(selected.provider, &report.resolutions)?;
    target.check_exact_restored_cut()?;
    let planned = approval.planned_selection()?;
    let lease = authority.claim_handover_held(&mut epoch, &sealed, approval.nonce()?)?;
    let confirmed = (|| {
        if lease.selection() != planned {
            return Err(Error::NeedsRecovery);
        }
        target.check_exact_restored_cut()?;
        epoch.finish()?;
        authority.state.healthy()
    })();
    if confirmed.is_err() {
        lease.close();
    }
    confirmed?;
    Ok(lease)
}
