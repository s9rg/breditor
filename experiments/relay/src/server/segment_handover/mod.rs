//! Host-local control of authenticated linked-room takeover. No control routes are registered.
mod alternates;
mod approval;
mod backup_files;
mod branches;
mod capture;
mod commit;
mod discussion_backup;
mod discussion_sources;
mod inputs;
mod maintenance;
mod native_lineage;
mod packed_clients;
mod packed_native_lineage;
mod portable_activation;
mod portable_backup;
mod portable_copy;
mod portable_seal;
mod resume;
mod retained_backup;
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
pub use portable_activation::SealedRelaySegmentActivation;
pub(in crate::server) use portable_backup::NamedPortableBackup;
pub use portable_backup::RelaySegmentPortableBackupIdentity;
pub use portable_seal::RelaySegmentPortableSeal;
pub use retained_backup::{RelaySegmentRetainedBackup, RelaySegmentRetainedBackupIdentity};

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
