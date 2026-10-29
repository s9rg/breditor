//! Detached ordered pins only. Saved path metadata never recreates native authority.
use super::super::ServerLogGenerationRecoveryStateIdentity;
use crate::ServerLogGenerationRoomBackupIdentity;
use serde::{Deserialize, Serialize};
/// Matches the factual delivery journal's maximum retained cuts; no history is truncated.
pub const MAX_DELIVERY_PATH_ANCESTORS: usize = 4096;
/// Aggregate complete retained predecessor bytes; exhaustion refuses without mutation.
pub const MAX_DELIVERY_PATH_ARCHIVE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Independently selected complete B/C1/... archives and unchanged original/current A/D pins.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerLogGenerationDeliveryPathIdentity {
    /// Closed family, breditor/server-log-generation-delivery-path.
    pub format: String,
    /// Closed revision, currently one.
    pub format_version: u32,
    /// Literal ordered complete predecessor selections; duplicate/no-op cuts remain literal.
    pub ancestors: Vec<ServerLogGenerationRoomBackupIdentity>,
    /// Actual original A, complete current D and its protected registration inventory.
    pub current: ServerLogGenerationRecoveryStateIdentity,
}
