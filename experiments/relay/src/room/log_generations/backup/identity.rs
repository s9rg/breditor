//! Independently retained source selection; it is never authentication or cross-host fencing.
use crate::RoomBackupIdentity;
use serde::{Deserialize, Serialize};

/// Host-selected physical archive. Keep independently of incoming bytes when restoring.
/// Matching this detached identity does not authenticate the caller or fence another service.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerLogGenerationBackupIdentity {
    /// Original native genesis/owner/compiler/transport and exact global event cut.
    pub source: RoomBackupIdentity,
    /// Exact selected immutable physical manifest, even when native counters did not change.
    pub manifest: [u8; 32],
    /// SHA-256 of this entire distinct archive, including every section and unpublished stage.
    pub archive_sha256: [u8; 32],
}

/// Detached archive metadata. No native owner, lease, provider permission or activation is held.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServerLogGenerationBackupInfo {
    /// Separate archive family, never the original single-log archive.
    pub format: &'static str,
    /// Exact framing version.
    pub format_version: u32,
    /// Exact independently trusted selection required by future restore.
    pub identity: ServerLogGenerationBackupIdentity,
    /// All selected files and retained unpublished stages; the instance marker is excluded.
    pub files: usize,
    /// Entire encoded archive length.
    pub bytes: u64,
}
