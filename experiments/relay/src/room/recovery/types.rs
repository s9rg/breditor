use crate::{
    RoomBackupIdentity,
    assets::{AssetBackupIdentity, AssetRestoreProgress},
};
use serde::{Deserialize, Serialize};

/// Independently trusted selected server cut. Never choose it from an incoming archive.
/// Digests bind exact bytes, not accounts, current permissions, deployment or provider authority.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerRoomBackupIdentity {
    /// Exact original native compiler, room/owner and durable server log lineage.
    pub room: RoomBackupIdentity,
    /// Exact original complete server raster inventory and archive file.
    pub assets: AssetBackupIdentity,
    /// SHA-256 of this entire independent server bundle.
    pub archive_sha256: [u8; 32],
}

/// Detached transport selection. Native replay is still required at recovery completion.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServerRoomBackupInfo {
    /// Independent family name.
    pub format: &'static str,
    /// Exact archive framing version.
    pub format_version: u32,
    /// Exact separately retained host selection, never an authentication grant.
    pub identity: ServerRoomBackupIdentity,
}

/// Read-only physical progress, not native replay proof, account authority or activation receipt.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ServerRoomRecoveryProgress {
    /// A final server log exists and matches the selected original bytes exactly.
    pub log_published: bool,
    /// Verified raster prefix, or no raster component has been started yet.
    pub assets: Option<AssetRestoreProgress>,
    /// Exact durable completion record exists; finish still revalidates/locks both components.
    pub completion_record: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Marker {
    pub format: String,
    pub format_version: u32,
    pub id: String,
    pub identity: ServerRoomBackupIdentity,
}
