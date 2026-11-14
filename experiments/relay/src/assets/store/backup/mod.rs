//! Whole immutable raster store archives and explicit resumable, not automatically activated, restore.
use super::{AssetStore, Manifest, private_options, sync_directory};
use crate::assets::AssetInfo;
use std::{fs::File, path::PathBuf};
mod admission;
mod capacity;
mod export;
mod format;
mod restore;
mod restore_files;
mod restore_scan;
mod retained;
mod selected_files;
mod stream;
pub(crate) use stream::AssetBackupStream;
#[cfg(test)]
mod tests;
mod types;
mod verify_source;
pub(super) use restore_files::guard_lock as guard_recovered_lock;

pub use format::MAX_SERVER_ASSET_BACKUP_BYTES;
pub use types::{AssetBackupIdentity, AssetBackupInfo, AssetRecoveryPolicy, AssetRestoreProgress};

struct ArchivedAsset {
    info: AssetInfo,
    encoded: Vec<u8>,
}

/// Original manifest and asset-record bytes with complete native raster admission.
/// Fields are private; detached metadata and checksums grant no provider/deployment authority.
pub struct AssetStoreBackup {
    header: format::Header,
    manifest: Vec<u8>,
    records: Vec<ArchivedAsset>,
    identity: AssetBackupIdentity,
}

/// Owns a private incomplete restore. Dropping it releases its lock, never deletes retained work.
/// Finish or resume explicitly; do not activate the destination before a ready store is returned.
pub struct AssetRestore {
    root: PathBuf,
    lock: File,
    marker: Option<restore::Marker>,
    identity: AssetBackupIdentity,
}
