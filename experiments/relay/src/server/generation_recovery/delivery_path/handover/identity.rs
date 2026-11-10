//! Explicitly selected pre-handover cuts and the existing successor-local path.
use super::super::ServerLogGenerationDeliveryPathIdentity;
use crate::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    server::{
        PreparedLogGenerationHandover, PreparedLogGenerationHandoverIdentity,
        RoomDeploymentAuthority, RoomDeploymentSelection,
    },
};
use serde::Serialize;
use std::sync::Arc;

/// Trusted native inputs. All archive selections and the seal are checked
/// against actual custody and the independently configured deployment authority.
pub struct ServerLogGenerationHandoverDeliveryPathOptions {
    /// Actual retained or cold-opened source intent for the successor.
    pub handover: Arc<PreparedLogGenerationHandover>,
    /// Complete handover choice retained independently of the archive files.
    pub expected_handover: PreparedLogGenerationHandoverIdentity,
    /// Actual deployment ledger for that choice.
    pub authority: RoomDeploymentAuthority,
    /// Complete earlier native and raster archives, in client journal order.
    pub earlier: Vec<ServerLogGenerationRoomBackup>,
    /// Independent pins for the earlier archives in exactly the same order.
    pub expected_earlier: Vec<ServerLogGenerationRoomBackupIdentity>,
}

/// Detached complete path pins for native composition. The seal selection
/// commits to the actual intent without exporting its private file witnesses.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLogGenerationHandoverDeliveryPathIdentity {
    /// Separate family, breditor/server-log-generation-handover-delivery-path.
    pub format: &'static str,
    /// Native proof identity revision.
    pub format_version: u32,
    /// Exact historic source-bound epoch for the successor's restore origin.
    pub seal: RoomDeploymentSelection,
    /// Literal ordered cuts before or equal to that origin.
    pub earlier: Vec<ServerLogGenerationRoomBackupIdentity>,
    /// Existing delivery path from the actual restore origin to the current cut.
    pub successor: ServerLogGenerationDeliveryPathIdentity,
}
