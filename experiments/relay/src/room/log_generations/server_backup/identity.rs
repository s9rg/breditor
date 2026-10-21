//! Independently trusted exact component selections. No account/provider/activation authority.
use super::super::ServerLogGenerationBackupIdentity;
use crate::assets::AssetBackupIdentity;
use serde::{Deserialize, Serialize};

/// Keep separately from incoming data. Pins complete history and raster bytes, not currentness.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerLogGenerationRoomBackupIdentity {
    /// Complete new native archive, physical manifest and original native cut.
    pub native: ServerLogGenerationBackupIdentity,
    /// Every original immutable raster, including unreferenced retained uploads.
    pub assets: AssetBackupIdentity,
    /// SHA-256 of the entire independently framed joined archive.
    pub archive_sha256: [u8; 32],
}
/// Detached complete server-scope inventory. Clients and present provider authority are separate.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServerLogGenerationRoomBackupInfo {
    /// Distinct joined archive family.
    pub format: &'static str,
    /// Exact independent envelope revision.
    pub format_version: u32,
    /// Independently retain this exact component/whole-file selection before recovery.
    pub identity: ServerLogGenerationRoomBackupIdentity,
    /// Total canonical encoded bytes, without creating another complete output buffer.
    pub bytes: u64,
}
