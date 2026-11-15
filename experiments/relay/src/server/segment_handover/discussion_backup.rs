//! One fenced native and raster cut together with its required original discussion archives.
use super::capture::{CHECKPOINT, NATIVE, RASTERS, capture};
use crate::{
    Error, RelaySegmentBaseFile, RelaySegmentClientJournal, RelaySegmentClientJournalPin,
    RelaySegmentJournalOwner, RelaySegmentRoomBackupFiles, RelaySegmentRoomBackupIdentity, Result,
    log::generations::{GenerationDirectory, GenerationFileWitness},
    server::{RoomDeploymentSelection, ServerBackupHandle, deployment_fence},
};
use serde::{Deserialize, Serialize};
use std::{fs::File, path::Path, sync::Arc};

const SOURCES: &str = "discussion-sources";

/// Independently retained identity of a capture and its exact original discussion sources.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentDiscussionBackupIdentity {
    /// Native archive, materialized checkpoint and complete raster store at this cut.
    pub backup: RelaySegmentRoomBackupIdentity,
    /// Serving epoch observed at capture. This is provenance, separate from current serving authority.
    pub source_epoch: RoomDeploymentSelection,
    /// Exact original files ordered by digest. Files are named `{index}.participant`.
    pub discussion_sources: Vec<RelaySegmentClientJournalPin>,
}

/// Verified portable relay-segment files and the original participant journals they require.
pub struct RelaySegmentDiscussionBackup {
    /// Held native and raster archives. Keep earlier linked native segments available separately.
    pub backup: RelaySegmentRoomBackupFiles,
    /// Held original files for the selected or alternate participant cohort on restore.
    pub discussion_sources: Vec<RelaySegmentClientJournal>,
}

impl RelaySegmentDiscussionBackup {
    /// Open the exact bundle from an independently selected identity and any required earlier native segment.
    /// Use the returned files in the ordinary verified restore and handover flow.
    ///
    /// # Errors
    /// Refuses incomplete captures, changed archives, wrong parents and missing or substituted originals.
    pub fn open(
        path: &Path,
        parent: Option<Arc<RelaySegmentBaseFile>>,
        expected: &RelaySegmentDiscussionBackupIdentity,
    ) -> Result<Self> {
        let directory = GenerationDirectory::open(path)?;
        let native = read_owned(&directory, NATIVE)?;
        let checkpoint = read_owned(&directory, CHECKPOINT)?;
        let base = match parent {
            Some(parent) => RelaySegmentBaseFile::open_linked(
                native,
                checkpoint,
                &expected.backup.native,
                parent,
            )?,
            None => RelaySegmentBaseFile::open(native, checkpoint, &expected.backup.native)?,
        };
        let backup = RelaySegmentRoomBackupFiles::open(
            Arc::new(base),
            read_owned(&directory, RASTERS)?,
            &expected.backup,
        )?;
        let required = backup.required_recovered_discussion_sources()?;
        if !required.iter().copied().eq(expected.discussion_sources.iter().map(|pin| pin.sha256)) {
            return Err(Error::Contract("relay discussion backup source roster differs"));
        }
        let discussion_sources = match open_sources(&directory, &expected.discussion_sources)? {
            Some(sources) => sources.files.into_iter().map(|source| source.journal).collect(),
            None => Vec::new(),
        };
        directory.guard()?;
        Ok(Self { backup, discussion_sources })
    }
}

fn read_owned(directory: &GenerationDirectory, name: &str) -> Result<File> {
    directory.guard()?;
    let path = directory.path.join(name);
    if !std::fs::symlink_metadata(&path)?.is_file() {
        return Err(Error::Contract("relay discussion backup requires a regular file"));
    }
    let file = File::open(&path)?;
    GenerationFileWitness::of(&file)?.guard(&file, &path)?;
    Ok(file)
}

struct OpenedSource {
    name: String,
    witness: GenerationFileWitness,
    journal: RelaySegmentClientJournal,
}

struct OpenedSources {
    directory: GenerationDirectory,
    files: Vec<OpenedSource>,
}

impl OpenedSources {
    fn check(&self) -> Result<()> {
        self.directory.guard()?;
        for source in &self.files {
            source.journal.check_named(&source.witness, &self.directory.path.join(&source.name))?;
        }
        self.directory.guard()
    }
}

fn open_sources(
    directory: &GenerationDirectory,
    pins: &[RelaySegmentClientJournalPin],
) -> Result<Option<OpenedSources>> {
    if pins.is_empty() {
        return Ok(None);
    }
    let sources = GenerationDirectory::open(&directory.path.join(SOURCES))?;
    let files = pins
        .iter()
        .enumerate()
        .map(|(index, pin)| {
            if !matches!(&pin.owner, RelaySegmentJournalOwner::IndependentParticipant { .. }) {
                return Err(Error::Contract(
                    "relay discussion backup requires original participant files",
                ));
            }
            let name = format!("{index}.participant");
            let file = read_owned(&sources, &name)?;
            let witness = GenerationFileWitness::of(&file)?;
            let journal = RelaySegmentClientJournal::open(file, pin.clone())?;
            Ok(OpenedSource { name, witness, journal })
        })
        .collect::<Result<Vec<_>>>()?;
    let opened = OpenedSources { directory: sources, files };
    opened.check()?;
    Ok(Some(opened))
}

impl ServerBackupHandle {
    /// Capture the native archive, checkpoint, raster store and every required discussion original under one serving epoch.
    /// Ordinary writes may proceed while the immutable companion archives are copied.
    /// The operator supplies any other selected or alternate journals required for the ordinary handover.
    /// Keep the returned identity independently. Run this blocking operation off async I/O workers.
    ///
    /// # Errors
    /// Refuses invalid owner authentication, stale serving authority, changed files and occupied destinations.
    /// A failed capture may leave partial files. Retry at a new absent path.
    pub fn capture_relay_segment_with_discussion_sources(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentDiscussionBackupIdentity> {
        self.capture_discussion_backup(principal, token, destination, || Ok(()))
    }

    pub(super) fn capture_discussion_backup(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
        after_cut: impl FnOnce() -> Result<()>,
    ) -> Result<RelaySegmentDiscussionBackupIdentity> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        let (captured, source_epoch) = host.deployment.fenced(|lease| {
            deployment_fence::transaction(Some(lease), || {
                Ok((capture(host, principal, destination)?, lease.selection()))
            })
        })?;
        after_cut()?;
        let discussion_sources = if captured.discussion_sources.is_empty() {
            Vec::new()
        } else {
            let custody = host.relay_segment_custody.as_ref().ok_or(Error::NeedsRecovery)?;
            custody.export_recovered_discussion_sources(
                &captured.discussion_sources,
                &captured.directory.path.join(SOURCES),
            )?
        };
        let verified = open_sources(&captured.directory, &discussion_sources)?;
        captured.directory.sync()?;
        host.deployment.fenced(|lease| {
            if lease.selection() != source_epoch {
                return Err(Error::Lease);
            }
            deployment_fence::transaction(Some(lease), || {
                if let Some(verified) = &verified {
                    verified.check()?;
                }
                captured.check(host)?;
                Ok(RelaySegmentDiscussionBackupIdentity {
                    backup: captured.backup,
                    source_epoch,
                    discussion_sources,
                })
            })
        })
    }
}
