use crate::assets::AssetInfo;
use serde::{Deserialize, Serialize};

/// Trusted selected archive identity. Retain independently; never adopt it from incoming bytes.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AssetBackupIdentity {
    /// Exact original room seed namespace.
    pub binding: String,
    /// SHA-256 of the complete independently framed file, not an authorization credential.
    pub archive_sha256: [u8; 32],
    /// Complete immutable asset count, including unreferenced retained files.
    pub assets: u64,
    /// Original encoded raster bytes, excluding record/manifest/archive overhead.
    pub bytes: u64,
}

/// Detached complete inventory. It does not bind another live store or authorize deletion.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetBackupInfo {
    /// Independent archive family.
    pub format: &'static str,
    /// Exact framing revision.
    pub format_version: u32,
    /// Selected namespace, bytes/count and exact file digest.
    pub identity: AssetBackupIdentity,
    /// Sorted complete original immutable metadata.
    pub assets: Vec<AssetInfo>,
}

/// Host acknowledgement, not automatic fencing, token recovery or service activation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetRecoveryPolicy {
    /// The host has reacquired authority and will activate only after coordinated recovery.
    HostReacquired,
}

/// Verified durable-prefix progress, not an upload acknowledgement or room activation receipt.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AssetRestoreProgress {
    /// Complete final records that exactly match the selected archive.
    pub complete_assets: usize,
    /// Selected complete immutable asset count.
    pub total_assets: usize,
    /// Encoded raster bytes represented by those complete records.
    pub complete_bytes: u64,
    /// Manifest and every record are exact, with no restore marker or staging files remaining.
    pub ready: bool,
}
