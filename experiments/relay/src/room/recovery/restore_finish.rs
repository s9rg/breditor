//! Both native components remain locked before a durable complete record can be published.
use super::{RecoveredServerRoom, ServerRoomBackup, ServerRoomRecovery, files};
use crate::{
    Error, Result,
    assets::{AssetRecoveryPolicy, AssetRestore},
};
impl ServerRoomRecovery {
    /// Resume exact components, fully replay native history, then sync one completion barrier.
    /// No router, uploader or client sync starts. Reconcile current authority and client recovery
    /// separately before handing the returned components to an explicitly configured service.
    /// # Errors
    /// Rejects divergent/unknown state, native replay, locks or I/O failures. Retain this directory
    /// and source for explicit resume; errors/drops never remove component files or the marker.
    pub fn finish(self, backup: &ServerRoomBackup) -> Result<RecoveredServerRoom> {
        self.progress(backup)?;
        let room = self.restore_log(backup)?;
        let path = self.root.join("assets");
        let attempt = if files::exists(&path)? {
            AssetRestore::resume(
                &path,
                &backup.assets,
                &backup.identity.assets,
                AssetRecoveryPolicy::HostReacquired,
            )?
        } else {
            AssetRestore::begin(
                &path,
                &backup.assets,
                &backup.identity.assets,
                AssetRecoveryPolicy::HostReacquired,
            )?
        };
        let assets = attempt.finish(&backup.assets)?;
        if room.asset_binding() != assets.binding() {
            return Err(Error::Contract("server recovery component binding"));
        }
        self.scan_root(backup)?;
        let completion = self.completion()?;
        let stage = self.ready_stage();
        let target = self.root.join(".ready.json");
        if !files::exists(&target)? || files::exists(&stage)? {
            files::prepare(&stage, &completion)?;
        }
        files::publish(&self.root, &stage, &target, &completion)?;
        files::retire(&self.root, &stage, &completion)?;
        self.scan_root(backup)?;
        Ok(RecoveredServerRoom { room, assets, root: self.root, lock: self.lock })
    }
}
