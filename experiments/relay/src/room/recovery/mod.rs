//! One independently selected server log/raster cut and explicit durable recovery barrier.
//! Client journals, participant inventory, live account/provider authority and activation stay separate.
use crate::{
    Room, RoomBackup,
    assets::{AssetStore, AssetStoreBackup},
};
use std::{fs::File, path::PathBuf};
mod admission;
mod capture;
mod files;
mod format;
mod operation;
mod restore_begin;
mod restore_finish;
mod restore_log;
mod restore_resume;
mod restore_scan;
#[cfg(test)]
mod tests;
mod types;
pub use format::MAX_SERVER_ROOM_BACKUP_BYTES;
pub use operation::OperationalServerRoom;
pub use types::{ServerRoomBackupIdentity, ServerRoomBackupInfo, ServerRoomRecoveryProgress};

/// Complete original server log/raster archive. Private payloads cannot be edited after admission.
/// This is not a complete room backup: client/offline stores and current host authority are external.
pub struct ServerRoomBackup {
    header: format::Header,
    room: RoomBackup,
    assets: AssetStoreBackup,
    identity: ServerRoomBackupIdentity,
}

/// Owns one inactive private destination and its immutable recovery selection.
/// Drop releases the lock without deleting files; resume explicitly with the same trusted archive.
pub struct ServerRoomRecovery {
    root: PathBuf,
    lock: File,
    marker: types::Marker,
}

/// Both native components are verified and locked behind a synced completion record.
/// The host must reconcile current authority and client recovery before starting a service.
pub struct RecoveredServerRoom {
    room: Room,
    assets: AssetStore,
    root: PathBuf,
    lock: File,
}

impl RecoveredServerRoom {
    /// Exact recovered directory, not a current deployment/fencing credential.
    #[must_use]
    pub fn root(&self) -> &std::path::Path {
        &self.root
    }
    /// Release the coordinator lock while transferring the two still-locked native components.
    /// This starts no network or upload. Supply fresh host authentication and activation policy.
    #[must_use]
    pub fn into_parts(self) -> (Room, AssetStore) {
        let Self { room, assets, root: _, lock } = self;
        drop(lock);
        (room, assets)
    }
}
