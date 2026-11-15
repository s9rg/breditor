//! Activate a real relocated target after the exact portable source seal.
use super::{
    RelaySegmentHandoverApproval, RelaySegmentPortableSeal, VerifiedRelaySegmentHandoverInputs,
    router_with_recovered_segment,
};
use crate::{
    RecoveredRelaySegmentRoom, Result,
    server::{
        Authentication, RoomDeploymentAuthority, RoomDeploymentSelection, ServerBackupHandle,
        deployment_fence,
    },
};

/// Independently selected source seal and complete fresh proof for one actual restored target.
pub struct SealedRelaySegmentActivation<'a> {
    /// Actual authority that fenced the original source.
    pub authority: &'a RoomDeploymentAuthority,
    /// Source decision retained independently of the portable bundle.
    pub seal: &'a RelaySegmentPortableSeal,
    /// Approval of the exact new target using the seal as its previous selection.
    pub approval: &'a RelaySegmentHandoverApproval,
    /// Current protected-stream and provider proof for this specific target.
    pub inputs: &'a VerifiedRelaySegmentHandoverInputs,
}

impl RecoveredRelaySegmentRoom {
    /// Activate this exact restored target from the independently sealed source.
    /// Keep the approval independently to resume the same target after an interrupted reply.
    /// The original host does not participate. Run off async I/O workers.
    ///
    /// # Errors
    /// Refuses unsealed or superseded source, changed or mismatched target and inputs, or wrong owner.
    pub fn activate_sealed_portable_relay(
        self,
        authentication: Authentication,
        principal: &str,
        token: &str,
        selection: SealedRelaySegmentActivation<'_>,
    ) -> Result<(axum::Router, ServerBackupHandle, RoomDeploymentSelection)> {
        authentication.authenticate(principal, token)?;
        self.check_handover_owner(principal)?;
        let lease = deployment_fence::activate_portable_segment(&self, principal, &selection)?;
        let active = lease.selection();
        let (router, handle) = router_with_recovered_segment(self, authentication, lease)?;
        Ok((router, handle, active))
    }
}
