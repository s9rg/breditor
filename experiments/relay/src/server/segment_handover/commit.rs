//! Bind authenticated owner consent to the exact live source and held restored target.
use super::{RelaySegmentHandoverApproval, router_with_recovered_segment};
use crate::{
    RecoveredRelaySegmentRoom, Result,
    server::{
        Authentication, RoomDeploymentSelection, ServerBackupHandle, deployment_fence,
        generation_backup::durable::Interruption,
    },
};

impl ServerBackupHandle {
    /// Commit an independently retained approval against the current old host.
    /// Returns a router and backup handle for the new epoch. Run this blocking host
    /// operation off async I/O workers. Retire the old listener after success.
    ///
    /// # Errors
    /// Stale source/target, account or owner mismatch, a busy epoch, or uncertain storage refuses.
    /// If the append may have reached disk, reopen the exact approved target and use
    /// `RecoveredRelaySegmentRoom::resume_handover`. Preserve both native directories.
    pub fn commit_relay_segment_handover(
        &self,
        principal: &str,
        token: &str,
        target: RecoveredRelaySegmentRoom,
        authentication: Authentication,
        approval: &RelaySegmentHandoverApproval,
    ) -> Result<(axum::Router, ServerBackupHandle, RoomDeploymentSelection)> {
        self.host.authentication.authenticate(principal, token)?;
        authentication.authenticate(principal, token)?;
        target.check_handover_owner(principal)?;
        approval.check_target(&target)?;
        let lease = deployment_fence::commit_segment_handover(
            &self.host,
            principal,
            &target,
            approval,
            &Interruption::default(),
        )?;
        let selection = lease.selection();
        let (router, handle) = router_with_recovered_segment(target, authentication, lease)?;
        Ok((router, handle, selection))
    }
}
