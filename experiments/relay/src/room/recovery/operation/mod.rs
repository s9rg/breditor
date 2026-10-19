//! Explicit durable storage handoff after exact recovery, then native append-only reopening.
//! No authentication, client/provider coverage, generation rollover or service starts here.
use super::ServerRoomBackupIdentity;
use crate::{Room, assets::AssetStore};
use std::{
    fs::File,
    path::{Path, PathBuf},
};
mod begin;
mod marker;
mod resume;
mod validate;

/// Locked actual native storage after a durable operational-intent barrier.
/// Original recovery files remain unchanged. Reopening admits the full current log and all
/// current rasters, requires the exact selected log prefix and retains every original raster.
/// This is storage provenance, not an account/provider/client-coverage or activation proof.
///
/// ```compile_fail
/// use breditor_collab_relay::OperationalServerRoom;
/// let _: OperationalServerRoom = serde_json::from_str("{}").unwrap();
/// ```
pub struct OperationalServerRoom {
    room: Room,
    assets: AssetStore,
    root: PathBuf,
    lock: File,
    origin: Box<ServerRoomBackupIdentity>,
}

impl OperationalServerRoom {
    /// Exact retained operational directory, not a current deployment/fencing credential.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Detached original source selection. Later accepted operations never replace this origin.
    #[must_use]
    pub fn origin(&self) -> ServerRoomBackupIdentity {
        (*self.origin).clone()
    }

    /// Transfer still-locked native components only after the operational marker is durable.
    /// Releases the coordinator lock, not the native log/raster locks. Starts no service.
    /// The host must separately check current account/registration/deployment authority,
    /// provider closure and all client histories before an explicitly authorized activation.
    #[must_use]
    pub fn into_parts(self) -> (Room, AssetStore) {
        let Self { room, assets, lock, root: _, origin: _ } = self;
        drop(lock);
        (room, assets)
    }
}
