//! Independently selected inactive reservation. Occupied targets are never adopted or overwritten.
use super::super::{ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity};
use super::{ServerLogGenerationRoomRecovery, files, selection::Marker};
use crate::{
    Error, Result, RoomRecoveryPolicy, credentials, log::generations::GenerationDirectory,
};
use std::path::Path;
pub(super) fn selected(
    backup: &ServerLogGenerationRoomBackup,
    expected: &ServerLogGenerationRoomBackupIdentity,
    policy: RoomRecoveryPolicy,
) -> Result<()> {
    let RoomRecoveryPolicy::HostReacquired = policy;
    if backup.info()?.identity != *expected {
        return Err(Error::Contract("joined generation selected archive"));
    }
    Ok(())
}
impl ServerLogGenerationRoomRecovery {
    /// Reserve an absent private directory. Expected identity must be retained independently of
    /// incoming bytes. The host separately fences the old deployment; this starts no service.
    /// # Errors
    /// Wrong selection, occupied/ambiguous paths, competing owners and persistence failure refuse.
    /// Failed initial reservation may retain an unready directory; inspect it and use a fresh path.
    pub fn begin(
        path: &Path,
        backup: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        selected(backup, expected, policy)?;
        let directory = GenerationDirectory::create(path)?;
        let marker = Marker {
            format: "breditor/server-log-generation-room-recovery".into(),
            format_version: 1,
            id: credentials::issue()?,
            identity: expected.clone(),
        };
        directory.create_file(".recovery.json", &files::encode(&marker)?)?;
        Ok(Self {
            directory,
            marker,
            #[cfg(test)]
            stop_after: None,
        })
    }
    /// Reacquire only this exact inactive reservation. Later native/raster edits refuse rather
    /// than rolling the recovered room back to its historic source.
    /// # Errors
    /// Missing/wrong selection, invalid controls/custody, competing owners or changed state refuse.
    pub fn resume(
        path: &Path,
        backup: &ServerLogGenerationRoomBackup,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        selected(backup, expected, policy)?;
        let directory = GenerationDirectory::open(path)?;
        let marker: Marker = files::read(&directory.path.join(".recovery.json"))?;
        credentials::hash(&marker.id)?;
        if marker.format != "breditor/server-log-generation-room-recovery"
            || marker.format_version != 1
            || marker.identity != *expected
        {
            return Err(Error::Contract("joined generation reservation differs"));
        }
        let attempt = Self {
            directory,
            marker,
            #[cfg(test)]
            stop_after: None,
        };
        attempt.progress(backup)?;
        Ok(attempt)
    }
    /// Known retained inactive destination; not permission to start a deployment.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.directory.path
    }
}
