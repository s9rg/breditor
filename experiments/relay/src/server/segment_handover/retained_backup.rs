//! Capture native state and the exact client inputs already held by the relay.
use super::{
    backup_files::{BackupCopies, open_room},
    capture::{CapturedSegment, begin_capture},
};
use crate::{
    RecoveredRelaySegmentRoom, RelaySegmentBaseFile, RelaySegmentClientJournal,
    RelaySegmentClientJournalPin, RelaySegmentClientUploadArchive, RelaySegmentClientUploadPin,
    RelaySegmentRoomBackupFiles, RelaySegmentRoomBackupIdentity, Result, RoomRecoveryPolicy,
    log::generations::GenerationDirectory,
    server::{Host, RoomDeploymentSelection, ServerBackupHandle},
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, path::Path, sync::Arc};

const SELECTED: &str = "selected-journals";
const ALTERNATES: &str = "alternate-journals";
const UPLOADS: &str = "standalone-uploads";

/// An independently retained selection of the room cut and the original inputs in its backup.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentRetainedBackupIdentity {
    /// Original native archive, materialized checkpoint and raster store.
    pub backup: RelaySegmentRoomBackupIdentity,
    /// Serving epoch observed at capture. This records provenance.
    pub source_epoch: RoomDeploymentSelection,
    /// Selected originals in canonical owner order, named `selected-journals/{index}.journal`.
    pub selected_journals: Vec<RelaySegmentClientJournalPin>,
    /// Alternate participant originals in canonical order, named `alternate-journals/{index}.participant`.
    pub alternate_journals: Vec<RelaySegmentClientJournalPin>,
    /// Original standalone queues named `standalone-uploads/{index}.uploads`.
    /// Queues embedded in selected participant originals are already part of those files.
    pub standalone_uploads: Vec<RelaySegmentClientUploadPin>,
}

impl RelaySegmentRetainedBackupIdentity {
    fn verify_pins(&self, required_discussion_sources: &BTreeSet<[u8; 32]>) -> Result<()> {
        RelaySegmentRoomBackupFiles::check_retained_client_backup_pins(
            required_discussion_sources,
            &self.selected_journals,
            &self.alternate_journals,
            &self.standalone_uploads,
        )
    }
}

/// Verified portable backup of the room and its already-retained inputs.
pub struct RelaySegmentRetainedBackup {
    backup: RelaySegmentRoomBackupFiles,
    selected: Vec<RelaySegmentClientJournal>,
    alternates: Vec<RelaySegmentClientJournal>,
    uploads: Vec<RelaySegmentClientUploadArchive>,
}

impl RelaySegmentRetainedBackup {
    /// Open the exact backup using the independent selection and any required earlier native segment.
    ///
    /// # Errors
    /// Refuses invalid rosters, changed or missing files and wrong native predecessors.
    pub fn open(
        path: &Path,
        parent: Option<Arc<RelaySegmentBaseFile>>,
        expected: &RelaySegmentRetainedBackupIdentity,
    ) -> Result<Self> {
        let directory = GenerationDirectory::open(path)?;
        Self::open_at(&directory, parent, expected)
    }

    pub(super) fn open_at(
        directory: &GenerationDirectory,
        parent: Option<Arc<RelaySegmentBaseFile>>,
        expected: &RelaySegmentRetainedBackupIdentity,
    ) -> Result<Self> {
        let backup = open_room(directory, parent, &expected.backup)?;
        let required = backup.required_recovered_discussion_sources()?.into_iter().collect();
        expected.verify_pins(&required)?;
        let retained = RetainedCopies::open(directory, expected)?;
        retained.check()?;
        directory.guard()?;
        Ok(Self {
            backup,
            selected: retained.selected.into_values(),
            alternates: retained.alternates.into_values(),
            uploads: retained.uploads.into_values(),
        })
    }

    /// Inspect the exact native and raster selection.
    #[must_use]
    pub fn backup(&self) -> &RelaySegmentRoomBackupFiles {
        &self.backup
    }

    pub(in crate::server) fn check_files(&self) -> Result<()> {
        self.backup.check()?;
        for journal in self.selected.iter().chain(&self.alternates) {
            journal.check_file()?;
        }
        for upload in &self.uploads {
            upload.check_file()?;
        }
        self.backup.check()
    }

    /// Restore the exact cut and its retained clients into a new, unselected room.
    /// Live takeover still requires ordinary authenticated handover and current client/provider checks.
    ///
    /// # Errors
    /// Refuses invalid, incomplete or changed originals and occupied destinations.
    pub fn restore(
        &self,
        destination: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
    ) -> Result<RecoveredRelaySegmentRoom> {
        if self.selected.is_empty() {
            if self.uploads.is_empty() {
                return self.backup.restore(destination, active_generation, policy);
            }
            return self.backup.restore_with_client_upload_archives(
                destination,
                active_generation,
                policy,
                &self.uploads,
            );
        }
        self.backup.restore_with_client_journal_alternatives(
            destination,
            active_generation,
            policy,
            &self.uploads,
            &self.selected,
            &self.alternates,
        )
    }
}

pub(super) struct RetainedCopies {
    selected: BackupCopies<RelaySegmentClientJournal>,
    alternates: BackupCopies<RelaySegmentClientJournal>,
    uploads: BackupCopies<RelaySegmentClientUploadArchive>,
}

impl RetainedCopies {
    pub(super) fn capture(
        host: &Host,
        captured: &CapturedSegment,
        source_epoch: RoomDeploymentSelection,
    ) -> Result<(RelaySegmentRetainedBackupIdentity, Self)> {
        let (selected_journals, alternate_journals, standalone_uploads) =
            match &host.relay_segment_custody {
                Some(custody) => (
                    custody.export_selected_journals(&captured.directory.path.join(SELECTED))?,
                    custody.export_alternates(&captured.directory.path.join(ALTERNATES))?,
                    custody.export_standalone_uploads(&captured.directory.path.join(UPLOADS))?,
                ),
                None => (Vec::new(), Vec::new(), Vec::new()),
            };
        let expected = RelaySegmentRetainedBackupIdentity {
            backup: captured.backup.clone(),
            source_epoch,
            selected_journals,
            alternate_journals,
            standalone_uploads,
        };
        expected.verify_pins(&captured.discussion_sources)?;
        let copies = Self::open(&captured.directory, &expected)?;
        Ok((expected, copies))
    }

    fn open(
        directory: &GenerationDirectory,
        expected: &RelaySegmentRetainedBackupIdentity,
    ) -> Result<Self> {
        Ok(Self {
            selected: BackupCopies::open(
                directory,
                SELECTED,
                "journal",
                &expected.selected_journals,
                RelaySegmentClientJournal::open,
                RelaySegmentClientJournal::check_named,
            )?,
            alternates: BackupCopies::open(
                directory,
                ALTERNATES,
                "participant",
                &expected.alternate_journals,
                RelaySegmentClientJournal::open,
                RelaySegmentClientJournal::check_named,
            )?,
            uploads: BackupCopies::open(
                directory,
                UPLOADS,
                "uploads",
                &expected.standalone_uploads,
                RelaySegmentClientUploadArchive::open,
                RelaySegmentClientUploadArchive::check_named,
            )?,
        })
    }

    pub(super) fn check(&self) -> Result<()> {
        self.selected.check()?;
        self.alternates.check()?;
        self.uploads.check()
    }
}

impl ServerBackupHandle {
    /// Capture the exact native and raster cut and all client originals already retained by this relay.
    /// Keep the returned identity and earlier native segments independently.
    /// Clients retain any newer local work through their normal storage or exports.
    /// Run this blocking operation off async I/O workers.
    ///
    /// # Errors
    /// Refuses invalid owner authentication, superseded epochs, changed files and occupied destinations.
    /// A failed capture may leave unconfirmed output. Use another absent path to retry.
    pub fn capture_relay_segment_with_retained_clients(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentRetainedBackupIdentity> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        let (captured, source_epoch) = begin_capture(host, principal, destination)?;
        let (expected, retained) = RetainedCopies::capture(host, &captured, source_epoch)?;
        captured.confirm(host, &expected.source_epoch, || retained.check())?;
        Ok(expected)
    }
}
