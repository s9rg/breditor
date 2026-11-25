//! Immutable room-bound raster storage, independent of document operations and Undo history.
//! Only the host chooses the directory. Network callers never supply a filesystem path.
mod prepare;
mod record;
pub(crate) use record::decode as decode_raster_record;
mod store;
mod types;
#[cfg(feature = "server")]
pub(crate) use prepare::encoded_input;
pub use prepare::{PreparedAsset, asset_id, prepare_asset};
pub use store::AssetStore;
#[cfg(feature = "server")]
pub(crate) use store::MAX_STAGE_BYTES;
#[cfg(feature = "server")]
pub use store::PendingRasterUpload;
pub use store::{
    AssetBackupIdentity, AssetBackupInfo, AssetRecoveryPolicy, AssetRestore, AssetRestoreProgress,
    AssetStoreBackup, MAX_SERVER_ASSET_BACKUP_BYTES,
};
pub(crate) use store::{AssetBackupStream, admit_asset_file};
pub(crate) use types::key as asset_key;
pub use types::{AssetInfo, AssetReceipt, RasterMime, StoredAsset};

/// Encoded raster ceiling, matching the browser asset store.
pub const MAX_ASSET_BYTES: u64 = 10 * 1024 * 1024;
/// Maximum admitted declared/decoded pixels before any host-side publication.
pub const MAX_PIXELS: u64 = 32_000_000;
/// Maximum width or height.
pub const MAX_DIMENSION: u32 = 16_384;
/// Reference room payload budget. No implicit asset/history garbage collection occurs.
pub const MAX_STORED_BYTES: u64 = 256 * 1024 * 1024;
/// Reference room asset count budget.
pub const MAX_ASSETS: usize = 1024;
