//! Capture native state and the exact client inputs already held by the relay.
use super::{
    backup_files::{BackupCopies, RoomBackupCopies, copy_group},
    capture::{CapturedSegment, begin_capture},
    packed_clients::{self, PackedClients},
};
use crate::{
    RecoveredRelaySegmentRoom, RelaySegmentBaseFile, RelaySegmentClientJournal,
    RelaySegmentClientJournalPin, RelaySegmentClientUploadArchive, RelaySegmentClientUploadPin,
    RelaySegmentQueuedRasterRestore, RelaySegmentRoomBackupFiles, RelaySegmentRoomBackupIdentity,
    Result, RoomRecoveryPolicy,
    log::generations::GenerationDirectory,
    room::SegmentCheckpointEncoding,
    server::{Host, RoomDeploymentSelection, ServerBackupHandle},
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, path::Path, sync::Arc};

pub(super) const SELECTED: &str = "selected-journals";
pub(super) const ALTERNATES: &str = "alternate-journals";
pub(super) const UPLOADS: &str = "standalone-uploads";

#[derive(Clone, Copy)]
pub(super) enum ClientLayout {
    Split,
    Packed,
}

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
    pub(super) fn verify_pins(
        &self,
        required_discussion_sources: &BTreeSet<[u8; 32]>,
    ) -> Result<()> {
        RelaySegmentRoomBackupFiles::check_retained_client_backup_pins(
            required_discussion_sources,
            &self.selected_journals,
            &self.alternate_journals,
            &self.standalone_uploads,
        )
    }

    pub(super) fn copy_clients(
        &self,
        source: &GenerationDirectory,
        destination: &GenerationDirectory,
    ) -> Result<()> {
        if packed_clients::present(source)? {
            return packed_clients::copy(source, destination, self);
        }
        copy_group(
            source,
            destination,
            SELECTED,
            "journal",
            self.selected_journals.iter().map(|pin| pin.bytes),
        )?;
        copy_group(
            source,
            destination,
            ALTERNATES,
            "participant",
            self.alternate_journals.iter().map(|pin| pin.bytes),
        )?;
        copy_group(
            source,
            destination,
            UPLOADS,
            "uploads",
            self.standalone_uploads.iter().map(|pin| pin.bytes),
        )
    }
}

/// Verified portable backup of the room and its already-retained inputs.
pub struct RelaySegmentRetainedBackup {
    backup: RelaySegmentRoomBackupFiles,
    clients: ClientArchives,
}

pub(super) struct ClientArchives {
    pub(super) selected: Vec<RelaySegmentClientJournal>,
    pub(super) alternates: Vec<RelaySegmentClientJournal>,
    pub(super) uploads: Vec<RelaySegmentClientUploadArchive>,
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
        Ok(RetainedBackupCopies::open(&directory, parent, expected)?.into_backup())
    }

    /// Inspect the exact native and raster selection.
    #[must_use]
    pub fn backup(&self) -> &RelaySegmentRoomBackupFiles {
        &self.backup
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
        if self.clients.selected.is_empty() {
            if self.clients.uploads.is_empty() {
                return self.backup.restore(destination, active_generation, policy);
            }
            return self.backup.restore_with_client_upload_archives(
                destination,
                active_generation,
                policy,
                &self.clients.uploads,
            );
        }
        self.backup.restore_with_client_journal_alternatives(
            destination,
            active_generation,
            policy,
            &self.clients.uploads,
            &self.clients.selected,
            &self.clients.alternates,
        )
    }

    /// Restore the selected room and keep upload-only payloads in their original archived queues.
    ///
    /// Selected participant dependencies still stage as live rasters. Future uploads and
    /// activation must pass normal live capacity, custody and provider checks.
    ///
    /// # Errors
    /// Refuses changed or invalid archives, excessive live dependencies and occupied targets.
    pub fn restore_retaining_client_uploads(
        &self,
        destination: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
    ) -> Result<RecoveredRelaySegmentRoom> {
        self.restore_selecting_queued_rasters(destination, active_generation, policy, &[])
    }

    /// Restore the portable backup and stage exactly the selected additional queued content IDs.
    ///
    /// Dependencies and original server assets remain live. Keep the returned target under
    /// custody and use ordinary handover verification before activation.
    ///
    /// # Errors
    /// Refuses missing, duplicate, unsorted or malformed IDs, invalid queue data, excessive
    /// live raster dependencies and occupied or uncertain destinations.
    pub fn restore_selecting_queued_rasters(
        &self,
        destination: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
        queued_rasters: &[String],
    ) -> Result<RecoveredRelaySegmentRoom> {
        self.backup.restore_selecting_queued_rasters(
            destination,
            active_generation,
            policy,
            RelaySegmentQueuedRasterRestore {
                archives: &self.clients.uploads,
                journals: &self.clients.selected,
                alternatives: &self.clients.alternates,
                queued_rasters,
            },
        )
    }
}

pub(super) struct RetainedBackupCopies {
    pub(super) room: RoomBackupCopies,
    clients: RetainedCopies,
}

impl RetainedBackupCopies {
    pub(super) fn open(
        directory: &GenerationDirectory,
        parent: Option<Arc<RelaySegmentBaseFile>>,
        expected: &RelaySegmentRetainedBackupIdentity,
    ) -> Result<Self> {
        let room = RoomBackupCopies::open(directory, parent, &expected.backup)?;
        let required = room.backup.required_recovered_discussion_sources()?.into_iter().collect();
        expected.verify_pins(&required)?;
        let clients = RetainedCopies::open(directory, expected)?;
        let copies = Self { room, clients };
        copies.check(directory)?;
        Ok(copies)
    }

    pub(super) fn check(&self, directory: &GenerationDirectory) -> Result<()> {
        self.clients.check(directory)?;
        self.room.check(directory)
    }

    pub(super) fn into_backup(self) -> RelaySegmentRetainedBackup {
        RelaySegmentRetainedBackup {
            backup: self.room.backup,
            clients: self.clients.into_archives(),
        }
    }
}

pub(super) enum RetainedCopies {
    Split(Box<SplitCopies>),
    Packed(PackedClients),
}

pub(super) struct SplitCopies {
    selected: BackupCopies<RelaySegmentClientJournal>,
    alternates: BackupCopies<RelaySegmentClientJournal>,
    uploads: BackupCopies<RelaySegmentClientUploadArchive>,
}

impl RetainedCopies {
    pub(super) fn capture(
        host: &Host,
        captured: &CapturedSegment,
        source_epoch: RoomDeploymentSelection,
        layout: ClientLayout,
    ) -> Result<(RelaySegmentRetainedBackupIdentity, Self)> {
        let mut expected = RelaySegmentRetainedBackupIdentity {
            backup: captured.backup.clone(),
            source_epoch,
            selected_journals: Vec::new(),
            alternate_journals: Vec::new(),
            standalone_uploads: Vec::new(),
        };
        match layout {
            ClientLayout::Split => {
                if let Some(custody) = &host.relay_segment_custody {
                    expected.selected_journals = custody
                        .export_selected_journals(&captured.directory.path.join(SELECTED))?;
                    expected.alternate_journals =
                        custody.export_alternates(&captured.directory.path.join(ALTERNATES))?;
                    expected.standalone_uploads = custody
                        .export_standalone_uploads(&captured.directory.path.join(UPLOADS))?;
                }
            }
            ClientLayout::Packed => {
                let mut output = packed_clients::create(&captured.directory)?;
                if let Some(custody) = &host.relay_segment_custody {
                    custody.write_portable_inputs(&mut output, &mut expected)?;
                }
                output.sync_all()?;
            }
        }
        expected.verify_pins(&captured.discussion_sources)?;
        let copies = Self::open(&captured.directory, &expected)?;
        Ok((expected, copies))
    }

    fn open(
        directory: &GenerationDirectory,
        expected: &RelaySegmentRetainedBackupIdentity,
    ) -> Result<Self> {
        if let Some(clients) = PackedClients::open(directory, expected)? {
            return Ok(Self::Packed(clients));
        }
        Ok(Self::Split(Box::new(SplitCopies::open(directory, expected)?)))
    }

    pub(super) fn check(&self, directory: &GenerationDirectory) -> Result<()> {
        match self {
            Self::Split(clients) => {
                if packed_clients::present(directory)? {
                    return Err(crate::Error::Contract("portable backup client layout changed"));
                }
                clients.check()
            }
            Self::Packed(clients) => clients.check(directory),
        }
    }

    fn into_archives(self) -> ClientArchives {
        match self {
            Self::Split(clients) => ClientArchives {
                selected: clients.selected.into_values(),
                alternates: clients.alternates.into_values(),
                uploads: clients.uploads.into_values(),
            },
            Self::Packed(clients) => clients.archives,
        }
    }
}

impl SplitCopies {
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

    fn check(&self) -> Result<()> {
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
        let (captured, source_epoch) =
            begin_capture(host, principal, destination, SegmentCheckpointEncoding::Original)?;
        let (expected, retained) =
            RetainedCopies::capture(host, &captured, source_epoch, ClientLayout::Split)?;
        captured.confirm(host, &expected.source_epoch, || retained.check(&captured.directory))?;
        Ok(expected)
    }
}
