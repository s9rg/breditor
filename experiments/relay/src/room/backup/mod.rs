//! Separate exact server-history archives. No network route, client import or generation rollover.
use crate::log::LogSnapshot;
mod export;
mod format;
mod identity;
mod restore;
mod staging;
#[cfg(test)]
mod tests;

pub use format::MAX_ROOM_BACKUP_BYTES;

/// Host-selected recovery acknowledgement, not authentication or a portable fencing token.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RoomRecoveryPolicy {
    /// The host has fenced the original service and reacquired this room's deployment authority.
    HostReacquired,
}

/// Host-selected original room and durable log cut. Retain in trusted host recovery configuration,
/// independently of the file being restored; never derive the expected cut from incoming bytes.
/// Matching this detached value does not authenticate the host or fence another deployment.
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoomBackupIdentity {
    /// Exact original native document identifier.
    pub document: String,
    /// Original immutable initial owner principal.
    pub owner: String,
    /// Exact seed-bound raster namespace, including original configuration and initial journal.
    pub asset_binding: String,
    /// Exact original compiler and standard-inline choice, distinct from writer transport.
    pub profile: crate::AtomicTransportProfile,
    /// Explicit original writer transport, one or two; never inferred from a target endpoint.
    pub writer_transport_version: u32,
    /// Exact complete record count at the selected durable cut, including inert preparations.
    pub records: u64,
    /// Original terminal record digest. The existing hash chain commits every preceding record.
    pub terminal_log_digest: [u8; 32],
}

/// Detached transport metadata. Checksums detect corruption; native replay remains mandatory.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoomBackupInfo {
    /// Independent archive family, never the original room log family.
    pub format: &'static str,
    /// Exact framing version.
    pub format_version: u32,
    /// Original complete log length, excluding the archive prefix.
    pub log_bytes: u64,
    /// Complete original durable records, including the seed.
    pub records: u64,
    /// SHA-256 of the original log payload, not a credential or server permission.
    pub sha256: String,
}

/// Bounded complete log bytes with transport integrity, not native replay or provider authority.
/// The private fields prevent a caller from mutating an admitted archive after validation.
pub struct RoomBackup {
    snapshot: LogSnapshot,
    digest: [u8; 32],
}

impl RoomBackup {
    // Borrowed only by the owning server coordinator; no public raw-log import or writer is added.
    pub(super) fn original_log(&self) -> &[u8] {
        &self.snapshot.bytes
    }
    pub(super) fn selected_cut(&self) -> (u64, [u8; 32]) {
        self.snapshot.cut()
    }
}
