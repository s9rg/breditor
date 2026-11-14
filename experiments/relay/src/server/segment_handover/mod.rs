//! Host-local control of authenticated linked-room takeover. No control routes are registered.
mod approval;
mod capture;
mod commit;
mod resume;
#[cfg(all(test, unix))]
mod tests;

pub use approval::RelaySegmentHandoverApproval;

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
