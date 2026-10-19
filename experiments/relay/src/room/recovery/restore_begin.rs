//! Reserve one absent inactive directory, never adopt or overwrite an occupied destination.
use super::{ServerRoomBackup, ServerRoomBackupIdentity, ServerRoomRecovery, files, types::Marker};
use crate::{Error, Result, RoomRecoveryPolicy, credentials};
use std::{fs::DirBuilder, io::Write, path::Path};
pub(super) fn selected(
    backup: &ServerRoomBackup,
    expected: &ServerRoomBackupIdentity,
    policy: RoomRecoveryPolicy,
) -> Result<()> {
    let RoomRecoveryPolicy::HostReacquired = policy;
    if &backup.identity != expected {
        return Err(Error::Contract("server recovery selected archive"));
    }
    Ok(())
}
impl ServerRoomRecovery {
    /// Reserve a never-overwritten private directory and durable exact-selection marker.
    /// The host separately fences the old deployment. No component, provider or service starts yet.
    /// # Errors
    /// Rejects wrong trusted identity, occupied/ambiguous names and persistence failure.
    /// A failed reservation may leave its known path; preserve and inspect rather than reset it.
    pub fn begin(
        root: &Path,
        backup: &ServerRoomBackup,
        expected: &ServerRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        selected(backup, expected, policy)?;
        let root = files::anchor(root)?;
        let mut builder = DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&root)?;
        let lock = files::options().create_new(true).open(root.join(".lock"))?;
        files::lock(&lock)?;
        let marker = Marker {
            format: "breditor/server-room-recovery".into(),
            format_version: 1,
            id: credentials::issue()?,
            identity: expected.clone(),
        };
        let mut file = files::options().create_new(true).open(root.join(".recovery.json"))?;
        file.write_all(&serde_json::to_vec(&marker)?)?;
        file.sync_all()?;
        drop(file);
        files::sync(&root)?;
        files::sync(root.parent().ok_or(Error::Contract("server recovery destination parent"))?)?;
        Ok(Self { root, lock, marker })
    }
    /// Known inactive retained destination. It is not an activation or currentness receipt.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }
}
