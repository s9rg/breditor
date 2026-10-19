//! Re-admit the original owned recovery selection without rewriting marker or component bytes.
use super::{
    ServerRoomBackup, ServerRoomBackupIdentity, ServerRoomRecovery, files, restore_begin::selected,
    types::Marker,
};
use crate::{Error, Result, RoomRecoveryPolicy, credentials};
use std::{fs, path::Path};
impl ServerRoomRecovery {
    /// Resume one inactive interrupted/completed attempt using independently retained selection.
    /// This never creates an absent marker or repairs unknown/divergent destination bytes.
    /// # Errors
    /// Rejects mismatched source, invalid marker, symlinks, competing owners and divergent state.
    pub fn resume(
        root: &Path,
        backup: &ServerRoomBackup,
        expected: &ServerRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        selected(backup, expected, policy)?;
        let root = files::anchor(root)?;
        if !fs::symlink_metadata(&root)?.is_dir()
            || !fs::symlink_metadata(root.join(".lock"))?.is_file()
        {
            return Err(Error::Contract("server recovery directory/lock type"));
        }
        let lock = files::options().open(root.join(".lock"))?;
        files::lock(&lock)?;
        let encoded = files::read_marker(&root.join(".recovery.json"))?;
        let marker: Marker = serde_json::from_slice(&encoded)?;
        if marker.format != "breditor/server-room-recovery"
            || marker.format_version != 1
            || marker.identity != *expected
            || credentials::hash(&marker.id).is_err()
            || serde_json::to_vec(&marker)? != encoded
        {
            return Err(Error::Contract("server recovery marker"));
        }
        let result = Self { root, lock, marker };
        result.progress(backup)?;
        Ok(result)
    }
}
