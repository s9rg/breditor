//! Explicit host-side capture capability. No account-facing backup/restore route is registered.
use super::{Authentication, Host, create_host, routes};
use crate::{Error, Result, Room, ServerRoomBackup, assets::AssetStore};
use axum::Router;
mod recovery_check;
mod recovery_inventory;
pub use recovery_check::{
    ServerRecoveryContinuationCoverage, ServerRecoveryContinuationIdentity, ServerRecoveryCoverage,
    VerifiedServerRecoveryContinuation, VerifiedServerRecoveryState,
};
pub use recovery_inventory::{ServerRecoveryState, ServerRecoveryStateIdentity};

/// Host-only access to a serialized server log/raster capture, not a browser/account capability.
/// Keep private: captures contain accepted/deleted history, credential digests and all raster files.
/// Clones retain native owners; drop the router, connections and every handle when stopping a host.
#[derive(Clone)]
pub struct ServerBackupHandle {
    host: Host,
}

/// Build the ordinary authenticated raster router with an explicit private host capture handle.
/// No new network endpoint is added. Original router constructors/defaults remain unchanged.
/// # Errors
/// Rejects mismatched original native room and raster namespaces.
pub fn router_with_server_backups(
    room: Room,
    authentication: Authentication,
    assets: AssetStore,
) -> Result<(Router, ServerBackupHandle)> {
    if room.asset_binding() != assets.binding() {
        return Err(Error::Contract("asset store room binding"));
    }
    let host = create_host(room, authentication, Some(assets));
    let handle = ServerBackupHandle { host: host.clone() };
    Ok((routes(host), handle))
}
impl ServerBackupHandle {
    /// Capture a consistent accepted server cut under the existing room-then-assets lock order.
    /// Runs native validation and reads off async I/O threads; acknowledges no client work or upload.
    /// Dropping the future does not cancel an already running blocking capture or modify its source.
    /// # Errors
    /// Rejects poisoned owners, absent raster storage, corruption or existing archive/native bounds.
    pub async fn capture(&self) -> Result<ServerRoomBackup> {
        let assets =
            self.host.assets.clone().ok_or(Error::Contract("server backup asset store absent"))?;
        self.host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                ServerRoomBackup::capture(room, &mut assets)
            })
            .await
    }
}
