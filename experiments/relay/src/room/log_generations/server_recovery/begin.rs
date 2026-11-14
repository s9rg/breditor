//! Independently selected inactive reservation. Occupied targets are never adopted or overwritten.
use super::super::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupFile,
    ServerLogGenerationRoomBackupIdentity,
};
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
        Self::begin_selected(path, expected)
    }

    /// Reserve an absent directory with a fully admitted file source, under the same host fence
    /// and independently selected identity as the buffered recovery path.
    /// # Errors
    /// Refuses wrong or changed input, occupied paths, or failed reservation.
    pub fn begin_file(
        path: &Path,
        backup: &ServerLogGenerationRoomBackupFile,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        let RoomRecoveryPolicy::HostReacquired = policy;
        if backup.identity != *expected {
            return Err(Error::Contract("joined generation selected archive"));
        }
        backup.input.check()?;
        Self::begin_selected(path, expected)
    }

    fn begin_selected(
        path: &Path,
        expected: &ServerLogGenerationRoomBackupIdentity,
    ) -> Result<Self> {
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
        let attempt = Self::resume_selected(path, expected)?;
        attempt.progress(backup)?;
        Ok(attempt)
    }

    /// Reacquire an existing reservation and verify all durable prefixes against a held file.
    /// Either recovery path may have created the reservation.
    /// # Errors
    /// Wrong or changed input, malformed or occupied destinations, or divergent files refuse.
    pub fn resume_file(
        path: &Path,
        backup: &ServerLogGenerationRoomBackupFile,
        expected: &ServerLogGenerationRoomBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        let RoomRecoveryPolicy::HostReacquired = policy;
        if backup.identity != *expected {
            return Err(Error::Contract("joined generation selected archive"));
        }
        backup.input.check()?;
        let attempt = Self::resume_selected(path, expected)?;
        attempt.progress_file(backup)?;
        Ok(attempt)
    }

    fn resume_selected(
        path: &Path,
        expected: &ServerLogGenerationRoomBackupIdentity,
    ) -> Result<Self> {
        let directory = GenerationDirectory::open(path)?;
        let marker: Marker = files::read(&directory.path.join(".recovery.json"))?;
        credentials::hash(&marker.id)?;
        if marker.format != "breditor/server-log-generation-room-recovery"
            || marker.format_version != 1
            || marker.identity != *expected
        {
            return Err(Error::Contract("joined generation reservation differs"));
        }
        Ok(Self {
            directory,
            marker,
            #[cfg(test)]
            stop_after: None,
        })
    }
    /// Known retained inactive destination; not permission to start a deployment.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.directory.path
    }
}
