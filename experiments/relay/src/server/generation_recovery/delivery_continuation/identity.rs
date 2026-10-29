//! Detached complete selections only; saved data cannot recreate the live proof.
use super::super::ServerLogGenerationRecoveryStateIdentity;
use crate::ServerLogGenerationRoomBackupIdentity;
use serde::{Deserialize, Serialize};

/// A separately pinned previous serving cut B and current native recovery cut A/C.
/// The actual restore origin A is never relabeled as B. No acknowledgement,
/// source adoption, account role or activation is represented by these fields.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerLogGenerationDeliveryContinuationIdentity {
    /// Closed family, breditor/server-log-generation-delivery-continuation.
    pub format: String,
    /// Closed revision, currently one.
    pub format_version: u32,
    /// Entire previous native/raster archive, not just visible document clocks.
    pub previous: ServerLogGenerationRoomBackupIdentity,
    /// Unchanged actual restore origin, complete current server and protected inventory.
    pub current: ServerLogGenerationRecoveryStateIdentity,
}
