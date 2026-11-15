//! Host-local control of authenticated linked-room takeover. No control routes are registered.
mod alternates;
mod approval;
mod branches;
mod capture;
mod commit;
mod discussion_backup;
mod discussion_sources;
mod inputs;
mod resume;
#[cfg(all(test, unix))]
mod tests;
mod upload_coverage;

pub use approval::RelaySegmentHandoverApproval;
pub use branches::RelaySegmentParticipantBranchInspection;
pub use discussion_backup::{RelaySegmentDiscussionBackup, RelaySegmentDiscussionBackupIdentity};
pub use inputs::{
    RelaySegmentHandoverInputCoverage, RelaySegmentHandoverInputReport,
    VerifiedRelaySegmentHandoverInputs,
};

use super::{Authentication, RoomDeploymentLease, ServerBackupHandle, routes};
use crate::{RecoveredRelaySegmentRoom, Result};
use std::sync::Arc;

pub(crate) fn router_with_recovered_segment(
    target: RecoveredRelaySegmentRoom,
    authentication: Authentication,
    lease: RoomDeploymentLease,
) -> Result<(axum::Router, ServerBackupHandle)> {
    let (room, assets, custody) = target.into_deployment_parts()?;
    let mut host =
        super::deployment_fence::prepare_host(room, authentication, Some(assets), lease)?;
    host.relay_segment_custody = Some(Arc::new(custody));
    let handle = ServerBackupHandle { host: host.clone() };
    Ok((routes(host), handle))
}
