//! Reserve an absent private destination under an independently selected source and host policy.
use super::super::{ServerLogGenerationBackup, ServerLogGenerationBackupIdentity};
use super::{ServerLogGenerationRecovery, files, types::Marker};
use crate::{
    Error, Result, RoomRecoveryPolicy, credentials, log::generations::GenerationDirectory,
};
use std::path::Path;
impl ServerLogGenerationRecovery {
    /// Reserve an absent inactive directory. The host separately fences the original deployment.
    /// Expected identity must come from independent trusted configuration, not incoming bytes.
    /// # Errors
    /// Wrong selection, occupied/ambiguous paths, entropy or I/O refuse without overwriting.
    /// Failed initial reservation can leave an unready directory; preserve it and use a fresh path.
    pub fn begin(
        path: &Path,
        backup: &ServerLogGenerationBackup,
        expected: &ServerLogGenerationBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        let RoomRecoveryPolicy::HostReacquired = policy;
        if &backup.info().identity != expected {
            return Err(Error::Contract("generation recovery selected archive"));
        }
        let directory = GenerationDirectory::create(path)?;
        let marker = Marker {
            format: "breditor/relay-log-generation-recovery".into(),
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
    /// Reacquire only this exact inactive reservation; no file or source history is overwritten.
    /// # Errors
    /// Wrong trusted selection, malformed controls, competing owners or divergent state refuse.
    pub fn resume(
        path: &Path,
        backup: &ServerLogGenerationBackup,
        expected: &ServerLogGenerationBackupIdentity,
        policy: RoomRecoveryPolicy,
    ) -> Result<Self> {
        let RoomRecoveryPolicy::HostReacquired = policy;
        if &backup.info().identity != expected {
            return Err(Error::Contract("generation recovery selected archive"));
        }
        let directory = GenerationDirectory::open(path)?;
        let marker: Marker = files::read(&directory.path.join(".recovery.json"))?;
        credentials::hash(&marker.id)?;
        if marker.format != "breditor/relay-log-generation-recovery"
            || marker.format_version != 1
            || &marker.identity != expected
        {
            return Err(Error::Contract("generation recovery reservation differs"));
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
    /// Known inactive destination; it is not authority to start a service.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.directory.path
    }
}
