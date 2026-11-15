//! Absent-only whole-room restore, followed by explicit reopen of exact committed owners.
use super::{
    RecoveredRelaySegmentRoom, RelaySegmentClientJournal, RelaySegmentClientJournalPin,
    RelaySegmentClientRaster, RelaySegmentClientUploadArchive, RelaySegmentClientUploadPin,
    RelaySegmentRoomBackupFiles, RelaySegmentRoomBackupIdentity,
    client_journals::{self, JournalDirectory, JournalSelection, RetainedJournals},
    client_rasters::{self, SelectedRaster},
    client_uploads::{self, RetainedUploadSelection, RetainedUploads, UploadSource},
};
use crate::{
    Error, Result, Room, RoomRecoveryPolicy,
    assets::{AssetBackupIdentity, AssetStore},
    log::{
        Log,
        generations::{GenerationDirectory, GenerationDirectoryWitness},
    },
    room::log_generations::{
        recovery::files,
        recovery_part::RecoveryPart,
        server_recovery::{raster_directory::RasterDirectory, selection::RasterWitness},
    },
};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

const COMPLETE: &str = ".segment-room-complete.json";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Completion {
    format_version: u32,
    backup: RelaySegmentRoomBackupIdentity,
    root: GenerationDirectoryWitness,
    native: GenerationDirectoryWitness,
    raster: RasterWitness,
    active: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    added: Option<ClientRasters>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    uploads: Option<RetainedUploadSelection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    journals: Option<JournalSelection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    alternatives: Option<JournalSelection>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClientRasters {
    selected: Vec<String>,
    restored_assets: AssetBackupIdentity,
}

struct OriginalJournals<'a> {
    selected: &'a [RelaySegmentClientJournal],
    alternatives: &'a [RelaySegmentClientJournal],
}

impl OriginalJournals<'_> {
    fn retain(
        self,
        directory: &GenerationDirectory,
    ) -> Result<(Option<RetainedJournals>, Option<RetainedJournals>)> {
        let selected =
            RetainedJournals::create(directory, self.selected, JournalDirectory::Selected)?;
        let alternatives = (!self.alternatives.is_empty())
            .then(|| {
                RetainedJournals::create(
                    directory,
                    self.alternatives,
                    JournalDirectory::Alternatives,
                )
            })
            .transpose()?;
        Ok((Some(selected), alternatives))
    }
}

struct RestoredClientArchives {
    uploads: Option<RetainedUploads>,
    journals: Option<RetainedJournals>,
    alternatives: Option<RetainedJournals>,
}

impl RelaySegmentRoomBackupFiles {
    /// Restore into an absent private directory using the newest checkpoint and exact raster
    /// archive. Original deployment directories are not needed. Retain all bound archive files.
    /// The host separately authorizes any new serving epoch.
    ///
    /// # Errors
    /// Refuses changed archives, occupied destinations, reused generation IDs and I/O failures.
    /// An incomplete attempt remains unselected. Preserve it and use another absent path.
    pub fn restore(
        &self,
        path: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
    ) -> Result<RecoveredRelaySegmentRoom> {
        self.restore_with_client_rasters(path, active_generation, policy, &[])
    }

    /// Restore the original native and raster history plus selected retained client payloads.
    /// Bytes are admitted and synced in the unpublished target. A client queue's status and
    /// epoch remain unchanged until ordinary authenticated delivery returns a receipt.
    ///
    /// # Errors
    /// Refuses changed contents, duplicate IDs, excessive inputs and occupied destinations.
    /// Preserve an incomplete attempt and retry at a new absent path.
    pub fn restore_with_client_rasters(
        &self,
        path: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
        rasters: &[RelaySegmentClientRaster],
    ) -> Result<RecoveredRelaySegmentRoom> {
        let rasters =
            rasters.iter().map(RelaySegmentClientRaster::selected).collect::<Result<Vec<_>>>()?;
        self.restore_selected(path, active_generation, policy, &rasters, None, None)
    }

    /// Restore and retain the complete original upload archive of each selected writer.
    /// The host selects exact archived bytes separately. Duplicate payloads across writers have
    /// one server raster, while each original queue keeps its own status and epoch.
    /// To authorize a handover, verify upload coverage against the actual native writer roster.
    ///
    /// # Errors
    /// Refuses duplicate writers, unsorted inputs, divergent bytes, occupied targets and
    /// excessive archives or raster union. An incomplete target is left unpublished.
    pub fn restore_with_client_upload_archives(
        &self,
        path: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
        archives: &[RelaySegmentClientUploadArchive],
    ) -> Result<RecoveredRelaySegmentRoom> {
        let sources: Vec<_> =
            archives.iter().map(RelaySegmentClientUploadArchive::source).collect();
        let rasters = client_uploads::select(&sources)?;
        self.restore_selected(path, active_generation, policy, &rasters, Some(&sources), None)
    }

    /// Restore uploaded assets and every selected original client-native journal to a new
    /// unpublished room. Authenticate and verify the entire journal cohort before takeover.
    ///
    /// # Errors
    /// Refuses occupied destinations, journal pins or bytes that differ, and invalid archives.
    pub fn restore_with_client_journals(
        &self,
        path: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
        archives: &[RelaySegmentClientUploadArchive],
        journals: &[RelaySegmentClientJournal],
    ) -> Result<RecoveredRelaySegmentRoom> {
        self.restore_with_client_journal_alternatives(
            path,
            active_generation,
            policy,
            archives,
            journals,
            &[],
        )
    }

    /// Retain an alternative exact participant archive alongside its selected original.
    /// Only selected originals contribute live queues and raster data. An alternative
    /// includes its original native histories, upload queue and rasters for independent
    /// recovery. The verified handover report binds both files.
    ///
    /// # Errors
    /// Refuses occupied paths, duplicate or unmatched participant identities, changed
    /// archive bytes and uncertain storage. Supply both cohorts in canonical owner order.
    /// Within the same alternate owner, order distinct files by ascending SHA-256 bytes.
    pub fn restore_with_client_journal_alternatives(
        &self,
        path: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
        archives: &[RelaySegmentClientUploadArchive],
        journals: &[RelaySegmentClientJournal],
        alternatives: &[RelaySegmentClientJournal],
    ) -> Result<RecoveredRelaySegmentRoom> {
        let mut sources: Vec<_> =
            archives.iter().map(RelaySegmentClientUploadArchive::source).collect();
        client_uploads::check_pins(
            &sources.iter().map(|source| source.pin.clone()).collect::<Vec<_>>(),
        )?;
        client_journals::check_sources(journals)?;
        if !alternatives.is_empty() {
            client_journals::check_alternative_sources(journals, alternatives)?;
        }
        for journal in journals {
            if let Some(source) = journal.participant_upload()? {
                sources.push(source);
            }
        }
        sources.sort_unstable_by_key(|source| source.pin.writer.as_str());
        let rasters = client_uploads::select(&sources)?;
        let mut selected = rasters
            .into_iter()
            .map(|raster| (raster.info.asset.as_str(), raster))
            .collect::<std::collections::BTreeMap<_, _>>();
        for journal in journals {
            journal.add_participant_rasters(&mut selected)?;
        }
        let rasters: Vec<_> = selected.into_values().collect();
        self.restore_selected(
            path,
            active_generation,
            policy,
            &rasters,
            Some(&sources),
            Some(OriginalJournals { selected: journals, alternatives }),
        )
    }

    fn restore_selected(
        &self,
        path: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
        rasters: &[SelectedRaster<'_>],
        archives: Option<&[UploadSource<'_>]>,
        originals: Option<OriginalJournals<'_>>,
    ) -> Result<RecoveredRelaySegmentRoom> {
        let RoomRecoveryPolicy::HostReacquired = policy;
        self.check()?;
        Log::validate_segment_restoration(&self.native, active_generation)?;
        client_rasters::check_selected(rasters, &self.identity.assets, &self.entries)?;
        let state = self.native.checkpoint_state()?;
        let directory = GenerationDirectory::create(path)?;
        let raster_directory = RasterDirectory::create(&directory.path.join("rasters"))?;
        let raster_witness = raster_directory.witness()?;
        // The parent is absent-only, exclusively held and unpublished. No existing component
        // can be adopted, even if its bytes match the accepted archive.
        for (name, entry) in &self.entries {
            directory.guard()?;
            raster_directory.guard()?;
            let file_path = raster_directory.path.join(name);
            let mut options = fs::OpenOptions::new();
            options.create_new(true).read(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options.open(&file_path)?;
            let expected = RecoveryPart::with_digest(
                self.rasters.all().section(entry.offset, entry.bytes)?,
                entry.sha256,
            );
            expected.append(&mut file, 0, expected.len())?;
            file.sync_all()?;
            expected.compare(&mut file, false)?;
        }
        raster_directory.sync()?;
        directory.sync()?;
        let (mut assets, raster) = raster_directory.into_store(&self.identity.assets.binding)?;
        if assets.prepare_backup_stream()?.identity != self.identity.assets {
            return Err(Error::Contract("restored raster archive differs"));
        }
        let added = if rasters.is_empty() {
            None
        } else {
            let selected = client_rasters::install(&mut assets, rasters)?;
            let stream = assets.prepare_backup_stream()?;
            stream.check_retains(&self.identity.assets, &self.entries)?;
            Some(ClientRasters { selected, restored_assets: stream.identity })
        };
        let uploads =
            archives.map(|archives| RetainedUploads::create(&directory, archives)).transpose()?;
        let (journals, alternatives) =
            originals.map_or(Ok((None, None)), |sources| sources.retain(&directory))?;
        let (log, recovery) = Log::create_restored_segment(
            &directory.path.join("native"),
            self.native.clone(),
            active_generation,
        )?;
        let (room, _) = Room::replay_relay_segment(log, recovery, state, false)?;
        let native = room.log.segment_directory_witness()?;
        self.check()?;
        raster.guard(&assets)?;
        let completed = Completion {
            format_version: if alternatives.is_some() {
                5
            } else if journals.is_some() {
                4
            } else if uploads.is_some() {
                3
            } else if added.is_some() {
                2
            } else {
                1
            },
            backup: self.identity.clone(),
            root: directory.witness()?,
            native,
            raster: raster_witness,
            active: active_generation.to_owned(),
            added,
            uploads: uploads.as_ref().map(|retained| retained.selection().clone()),
            journals: journals.as_ref().map(|retained| retained.selection().clone()),
            alternatives: alternatives.as_ref().map(|retained| retained.selection().clone()),
        };
        files::insert(&directory, COMPLETE, &files::encode(&completed)?)?;
        directory.guard()?;
        Ok(recovered(
            room,
            assets,
            raster,
            directory,
            completed,
            RestoredClientArchives { uploads, journals, alternatives },
        ))
    }

    /// Reopen the exact completed restore and admit its later complete native and raster work.
    /// Reopening preserves an incomplete live WAL tail for explicit recovery.
    ///
    /// # Errors
    /// Refuses earlier/incomplete attempts, changed component custody or missing original assets.
    pub fn reopen(
        &self,
        path: &Path,
        policy: RoomRecoveryPolicy,
    ) -> Result<RecoveredRelaySegmentRoom> {
        let RoomRecoveryPolicy::HostReacquired = policy;
        self.check()?;
        let directory = GenerationDirectory::open(path)?;
        let path = directory.path.join(COMPLETE);
        if !fs::symlink_metadata(&path)?.is_file() {
            return Err(Error::Contract("relay segment room completion type"));
        }
        let completed: Completion = files::read(&path)?;
        if completed.backup != self.identity
            || !matches!(
                (
                    completed.format_version,
                    &completed.added,
                    &completed.uploads,
                    &completed.journals,
                    &completed.alternatives
                ),
                (1, None, None, None, None)
                    | (2, Some(_), None, None, None)
                    | (3, _, Some(_), None, None)
                    | (4, _, Some(_), Some(_), None)
                    | (5, _, Some(_), Some(_), Some(_))
            )
        {
            return Err(Error::Contract("relay segment room completion differs"));
        }
        directory.guard_witness(&completed.root)?;
        let raster_directory =
            RasterDirectory::open(&directory.path.join("rasters"), &completed.raster)?;
        let (assets, raster) = raster_directory.into_store(&self.identity.assets.binding)?;
        assets.prepare_backup_stream()?.check_retains(&self.identity.assets, &self.entries)?;
        if let Some(added) = &completed.added {
            if added.selected.is_empty()
                || added.restored_assets.binding != self.identity.assets.binding
            {
                return Err(Error::Contract("restored client raster selection differs"));
            }
            client_rasters::check_retained(&assets, &added.selected)?;
        }
        let uploads = completed
            .uploads
            .as_ref()
            .map(|selected| RetainedUploads::reopen(&directory, selected))
            .transpose()?;
        let journals = completed
            .journals
            .as_ref()
            .map(|selected| {
                RetainedJournals::reopen(&directory, selected, JournalDirectory::Selected)
            })
            .transpose()?;
        let alternatives = completed
            .alternatives
            .as_ref()
            .map(|selected| {
                RetainedJournals::reopen(&directory, selected, JournalDirectory::Alternatives)
            })
            .transpose()?;
        if let Some(alternatives) = &alternatives {
            let selected = journals.as_ref().ok_or(Error::NeedsRecovery)?;
            if alternatives.pins().is_empty() {
                return Err(Error::Contract("empty alternative participant roster"));
            }
            client_journals::check_alternatives(selected.pins(), alternatives.pins())?;
        }
        let state = self.native.checkpoint_state()?;
        let (log, recovery) = Log::open_restored_segment_at(
            &directory.path.join("native"),
            &completed.native,
            self.native.clone(),
            &completed.active,
        )?;
        let (room, _) = Room::replay_relay_segment(log, recovery, state, false)?;
        self.check()?;
        raster.guard(&assets)?;
        directory.guard()?;
        Ok(recovered(
            room,
            assets,
            raster,
            directory,
            completed,
            RestoredClientArchives { uploads, journals, alternatives },
        ))
    }
}

fn recovered(
    room: Room,
    assets: AssetStore,
    raster: super::RasterCustody,
    directory: GenerationDirectory,
    completed: Completion,
    clients: RestoredClientArchives,
) -> RecoveredRelaySegmentRoom {
    #[cfg(feature = "server")]
    let (client_rasters, restored_assets) = completed.added.map_or_else(
        || (Vec::new(), completed.backup.assets.clone()),
        |added| (added.selected, added.restored_assets),
    );
    #[cfg(not(feature = "server"))]
    let _ = completed;
    RecoveredRelaySegmentRoom {
        room,
        assets,
        raster,
        directory,
        #[cfg(feature = "server")]
        backup: completed.backup,
        #[cfg(feature = "server")]
        active: completed.active,
        #[cfg(feature = "server")]
        client_rasters,
        #[cfg(feature = "server")]
        restored_assets,
        journals: clients.journals,
        alternatives: clients.alternatives,
        uploads: clients.uploads,
    }
}

impl RecoveredRelaySegmentRoom {
    /// Exact original writer/archive pins retained in this target, if explicitly selected.
    ///
    /// # Errors
    /// Refuses changed or uncertain retained custody.
    pub fn client_upload_pins(&self) -> Result<Option<Vec<RelaySegmentClientUploadPin>>> {
        self.uploads
            .as_ref()
            .map(|uploads| {
                self.check_custody()?;
                Ok(uploads.pins().cloned().collect())
            })
            .transpose()
    }

    /// Open an exact retained original upload archive for a trusted host's recovery or export.
    /// This read-only file grants no account access, publication, or upload acknowledgement.
    ///
    /// # Errors
    /// Refuses changed custody or bytes.
    pub fn open_client_upload_archive(&self, writer: &str) -> Result<Option<fs::File>> {
        self.uploads.as_ref().map_or(Ok(None), |uploads| uploads.read(writer))
    }
    /// Read one exact retained UTF-8 journal selected by the trusted recovery host.
    /// Use [`Self::copy_client_archive`] for binary participant originals.
    /// This file exports history but grants no registration or authoring rights.
    ///
    /// # Errors
    /// Refuses changed custody or bytes. A lane outside the cohort is absent.
    pub fn read_client_journal(
        &self,
        pin: &RelaySegmentClientJournalPin,
    ) -> Result<Option<String>> {
        self.check_custody()?;
        let Some(journals) = &self.journals else {
            return Ok(None);
        };
        journals
            .pins()
            .iter()
            .position(|retained| retained == pin)
            .map(|index| journals.read(index))
            .transpose()
    }

    /// Copy one selected original client archive to a trusted host-owned output.
    /// Only publish the destination after this call succeeds. No authority or receipt is granted.
    ///
    /// # Errors
    /// Refuses changed custody, wrong retained bytes and output I/O errors.
    pub fn copy_client_archive(
        &self,
        pin: &RelaySegmentClientJournalPin,
        output: &mut impl std::io::Write,
    ) -> Result<bool> {
        self.copy_retained_archive(self.journals.as_ref(), pin, output)
    }

    /// List the exact alternate participant file pins held by this restored room.
    ///
    /// # Errors
    /// Refuses changed or uncertain retained custody.
    pub fn client_alternate_pins(&self) -> Result<Vec<RelaySegmentClientJournalPin>> {
        self.check_custody()?;
        Ok(self.alternatives.as_ref().map_or_else(Vec::new, |journals| journals.pins().to_vec()))
    }

    /// Copy the selected alternate original into private host-owned output.
    ///
    /// # Errors
    /// Refuses changed file custody or an incomplete output write.
    pub fn copy_client_alternative(
        &self,
        pin: &RelaySegmentClientJournalPin,
        output: &mut impl std::io::Write,
    ) -> Result<bool> {
        self.copy_retained_archive(self.alternatives.as_ref(), pin, output)
    }

    fn copy_retained_archive(
        &self,
        journals: Option<&RetainedJournals>,
        pin: &RelaySegmentClientJournalPin,
        output: &mut impl std::io::Write,
    ) -> Result<bool> {
        self.check_custody()?;
        let Some(journals) = journals else {
            return Ok(false);
        };
        let Some(index) = journals.pins().iter().position(|retained| retained == pin) else {
            return Ok(false);
        };
        journals.copy(index, output)?;
        Ok(true)
    }

    /// Borrow the exact native and raster components under local recovery ownership.
    #[must_use]
    pub fn components(&self) -> (&Room, &AssetStore) {
        (&self.room, &self.assets)
    }

    /// Borrow both local owners for ordinary authenticated operations.
    #[must_use]
    pub fn components_mut(&mut self) -> (&mut Room, &mut AssetStore) {
        (&mut self.room, &mut self.assets)
    }

    /// Transfer both verified owners. The caller must configure serving authority separately.
    ///
    /// # Errors
    /// Refuses changed recovery or raster custody.
    pub fn into_components(self) -> Result<(Room, AssetStore)> {
        self.check_custody()?;
        Ok((self.room, self.assets))
    }

    pub(super) fn check_custody(&self) -> Result<()> {
        self.directory.guard()?;
        self.room.log.ready()?;
        self.raster.guard(&self.assets)?;
        if let Some(journals) = &self.journals {
            journals.check()?;
        }
        if let Some(alternatives) = &self.alternatives {
            alternatives.check()?;
        }
        if let Some(uploads) = &self.uploads {
            uploads.check()?;
        }
        Ok(())
    }
}
