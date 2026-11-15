//! Resume the exact committed restore after a process exit using real deployment lineage.
use super::{RelaySegmentHandoverApproval, router_with_recovered_segment};
use crate::{
    RecoveredRelaySegmentRoom, Result,
    server::{
        Authentication, RoomDeploymentAuthority, RoomDeploymentSelection, ServerBackupHandle,
        deployment_fence,
    },
};

impl RecoveredRelaySegmentRoom {
    /// Resume the approved local restore and its later complete work.
    /// A successful restart advances the same independent deployment authority to a fresh epoch.
    /// Supply the independently retained approval and a current authenticated room owner.
    /// For a coordinated authority, use `RoomDeploymentAuthority::open_at_least` with the latest
    /// independently retained selection. That selection must be at or beyond the first epoch
    /// that activated this target. Retain the returned selection for the next cold restart.
    ///
    /// # Errors
    /// Refuses a missing, superseded or unrelated commitment, changed target custody or authority,
    /// invalid owner authentication, incomplete local WAL, and concurrent ownership.
    pub fn resume_handover(
        self,
        authentication: Authentication,
        principal: &str,
        token: &str,
        authority: &RoomDeploymentAuthority,
        approval: &RelaySegmentHandoverApproval,
        expected: &RoomDeploymentSelection,
    ) -> Result<(axum::Router, ServerBackupHandle, RoomDeploymentSelection)> {
        authentication.authenticate(principal, token)?;
        self.check_handover_owner(principal)?;
        let lease =
            deployment_fence::resume_segment_handover(authority, &self, approval, expected)?;
        let selection = lease.selection();
        let (router, handle) = router_with_recovered_segment(self, authentication, lease)?;
        Ok((router, handle, selection))
    }
}
