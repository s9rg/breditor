//! Actual local prepared host plus a separately retained full ancestor archive.
use super::super::PreparedLogGenerationRecoveryHost;
use crate::ServerLogGenerationRoomBackup;
use std::sync::Arc;
/// Inactive physical recovery over actual local native/raster custody. The local restore origin
/// is never relabeled as its older ancestor. Clones share the same real native host; no router,
/// writer, provider/client reconciliation, deployment fencing or activation capability is created.
#[derive(Clone)]
pub struct PreparedPhysicalRoomRecoveryHost {
    pub(super) local: PreparedLogGenerationRecoveryHost,
    pub(super) ancestor: Arc<ServerLogGenerationRoomBackup>,
}
