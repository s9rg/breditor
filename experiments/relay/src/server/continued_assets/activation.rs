//! Authenticate, commit and restart one approved native and continued-raster serving owner.
use super::{ContinuedAssetServerHandle, ContinuedRasterActivationApproval, build};
use crate::{
    RecoveryRegistrationCredentials, Result,
    server::{
        Authentication, ContinuedRasterRoomBackupFiles, RecoveredContinuedRasterRoom,
        RoomDeploymentAuthority, RoomDeploymentLease, RoomDeploymentSelection,
        ServerRecoveryAssetProvider, deployment_fence, generation_backup::durable::Interruption,
    },
};
use axum::Router;
use std::path::Path;

/// Original protected inputs and separately retained operator decision for a live takeover.
pub struct ContinuedRasterActivation<'a> {
    /// Decision persisted independently of the restore.
    pub approval: &'a ContinuedRasterActivationApproval,
    /// Protected original writer and review registrations, excluded from the decision.
    pub credentials: &'a RecoveryRegistrationCredentials,
    /// Current generation-exact host mapping guard.
    pub provider: &'a dyn ServerRecoveryAssetProvider,
}

/// Independent epoch and room decision for restarting after a committed takeover.
pub struct ContinuedRasterRestart<'a> {
    /// Actual authority reopened against the independently saved epoch.
    pub authority: &'a RoomDeploymentAuthority,
    /// Same decision used at first activation.
    pub approval: &'a ContinuedRasterActivationApproval,
    /// Exact last selected serving epoch. For an interrupted first reply, use the planned epoch.
    pub expected: &'a RoomDeploymentSelection,
}

impl ContinuedAssetServerHandle {
    /// Replace the live source with the approved restore under one exclusive deployment permit.
    /// Save the approval separately first. If the append may have committed, restart using the
    /// planned selection. This host-side action performs blocking native I/O.
    ///
    /// # Errors
    /// Refuses stale epochs or source data, invalid authentication, changed inputs, omitted
    /// alternate originals, changed target custody and uncertain storage.
    pub fn activate_recovered_room(
        &self,
        authentication: Authentication,
        principal: &str,
        token: &str,
        mut target: RecoveredContinuedRasterRoom,
        selected: &ContinuedRasterActivation<'_>,
    ) -> Result<(Router, Self, RoomDeploymentSelection)> {
        self.host.authentication.authenticate(principal, token)?;
        let lease = deployment_fence::activate_continued_raster(
            &self.host,
            &authentication,
            principal,
            token,
            &mut target,
            selected,
            &Interruption::default(),
        )?;
        serve(target, authentication, &lease)
    }
}

impl ContinuedRasterRoomBackupFiles {
    /// Restart the exact committed serving room and its later complete native and raster work.
    /// Persist the returned selection independently. This uses the same authority ledger and
    /// refuses a target that has an incomplete native WAL.
    ///
    /// # Errors
    /// Refuses wrong owner credentials, replaced custody, missing selected records or assets,
    /// uncommitted or superseded decisions and uncertain authority.
    pub fn restart_activated_room(
        &self,
        destination: &Path,
        authentication: Authentication,
        principal: &str,
        token: &str,
        selection: &ContinuedRasterRestart<'_>,
    ) -> Result<(Router, ContinuedAssetServerHandle, RoomDeploymentSelection)> {
        authentication.authenticate(principal, token)?;
        let approval = selection.approval;
        let (lease, target) = deployment_fence::resume_retained_handover(
            selection.authority,
            &approval.planned_selection()?,
            selection.expected,
            |epoch| approval.restart_nonce(epoch),
            || {
                let target = self.reopen_with_history(destination, approval.target(), true)?;
                target.room().recovery_inventory_owner(principal)?;
                approval.check_target(&target)?;
                Ok(target)
            },
        )?;
        serve(target, authentication, &lease)
    }
}

pub(super) fn serve(
    target: RecoveredContinuedRasterRoom,
    authentication: Authentication,
    lease: &RoomDeploymentLease,
) -> Result<(Router, ContinuedAssetServerHandle, RoomDeploymentSelection)> {
    let next = lease.selection();
    let (room, assets, custody) = target.into_serving_parts();
    let result = build(room, authentication, assets, lease.clone(), Some(custody));
    if result.is_err() {
        lease.close();
    }
    let (router, handle) = result?;
    Ok((router, handle, next))
}
