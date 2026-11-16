//! Restore only into an absent directory and write completion after every owner has synced.
use super::{
    ContinuedRasterRoomBackupFiles, ContinuedRasterRoomClientArchives,
    RecoveredContinuedRasterRoom, RecoveredContinuedRasterRoomIdentity,
    clients::{ClientSelection, ClientSources, RetainedClients},
    stage_rasters::StagedRasters,
};
use crate::{
    ContinuedAssetStore, ContinuedAssetStoreIdentity, Error, Recovery, Result, Room,
    RoomBackupIdentity,
    assets::AssetBackupIdentity,
    log::{
        Log,
        generations::{GenerationDirectory, GenerationDirectoryWitness, GenerationFileWitness},
    },
    room::log_generations::{
        recovery::files,
        segment_room_recovery::{
            client_rasters, restore_retaining_client_uploads::check_queued_rasters,
        },
    },
    server::ContinuedRasterRoomBackupIdentity,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

pub(super) const COMPLETE: &str = ".continued-raster-room-complete.json";
const FORMAT: &str = "breditor/recovered-continued-raster-room";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Completion {
    format: String,
    format_version: u32,
    pub(super) backup: ContinuedRasterRoomBackupIdentity,
    pub(super) directory: GenerationDirectoryWitness,
    native: GenerationDirectoryWitness,
    active_generation: String,
    rasters: ContinuedAssetStoreIdentity,
    clients: ClientSelection,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    staged: Option<StagedRasters>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    rollover: Option<AssetBackupIdentity>,
}

impl Completion {
    fn active_rasters(&self) -> &AssetBackupIdentity {
        self.staged
            .as_ref()
            .map(|staged| &staged.active)
            .or(self.rollover.as_ref())
            .unwrap_or_else(|| self.backup.rasters.active())
    }

    pub(super) fn staged_ids(&self) -> &[String] {
        self.staged.as_ref().map_or(&[], |staged| staged.ids.as_slice())
    }

    fn matches_revision(&self) -> bool {
        self.format_version == completion_revision(self.rollover.is_some(), self.staged.is_some())
            && self.staged.as_ref().is_none_or(|staged| !staged.ids.is_empty())
            && self
                .rollover
                .as_ref()
                .is_none_or(|identity| identity.assets == 0 && identity.bytes == 0)
    }
}

const fn completion_revision(rollover: bool, staged: bool) -> u32 {
    match (rollover, staged) {
        (false, false) => 1,
        (false, true) => 2,
        (true, false) => 3,
        (true, true) => 4,
    }
}

#[derive(Clone, Copy)]
pub(super) enum ReplayMode<'a> {
    Unserved,
    Serving,
    NativeTail(&'a RoomBackupIdentity),
    PendingRaster(&'a RoomBackupIdentity),
}

impl<'a> ReplayMode<'a> {
    fn floor(self) -> Option<&'a RoomBackupIdentity> {
        match self {
            Self::NativeTail(floor) | Self::PendingRaster(floor) => Some(floor),
            Self::Unserved | Self::Serving => None,
        }
    }
}

impl ContinuedRasterRoomBackupFiles {
    /// Restore the backup and selected original client archives into an absent private directory.
    /// Save the returned room's identity separately for cold reopening. Original native archive
    /// files remain required. Run off async I/O workers.
    ///
    /// # Errors
    /// Refuses invalid inputs, missing required discussion originals, reused native IDs, occupied
    /// paths and storage failures. An incomplete target stays unserved.
    pub fn restore(
        &self,
        path: &Path,
        active_generation: &str,
        inputs: ContinuedRasterRoomClientArchives<'_>,
    ) -> Result<RecoveredContinuedRasterRoom> {
        self.restore_staging_client_rasters(path, active_generation, inputs, &[])
    }

    /// Restore to an absent directory and stage only the selected client payloads.
    /// Select missing content IDs from independently pinned queues or participant originals.
    /// Keep the original upload status and receipt history for later ordinary delivery.
    ///
    /// # Errors
    /// Refuses missing, repeated or already captured IDs, invalid originals, excessive active
    /// storage, occupied destinations and uncertain custody. Run off async I/O workers.
    pub fn restore_staging_client_rasters(
        &self,
        path: &Path,
        active_generation: &str,
        inputs: ContinuedRasterRoomClientArchives<'_>,
        staged_ids: &[String],
    ) -> Result<RecoveredContinuedRasterRoom> {
        self.restore_selected(path, active_generation, inputs, staged_ids, false)
    }

    /// Seal the captured nonempty active raster archive and restore into a fresh generation.
    /// Select any required missing raster payloads from the same independently held client inputs.
    /// Keep the original native and raster capture, approvals and clients for the normal takeover.
    ///
    /// # Errors
    /// Refuses an empty or exhausted lineage, changed inputs, invalid staging selections, reused
    /// native IDs, occupied paths and storage failures. The fresh target remains unserved.
    pub fn restore_rolling_raster_generation(
        &self,
        path: &Path,
        active_generation: &str,
        inputs: ContinuedRasterRoomClientArchives<'_>,
        staged_ids: &[String],
    ) -> Result<RecoveredContinuedRasterRoom> {
        self.restore_selected(path, active_generation, inputs, staged_ids, true)
    }

    fn restore_selected(
        &self,
        path: &Path,
        active_generation: &str,
        inputs: ContinuedRasterRoomClientArchives<'_>,
        staged_ids: &[String],
        rollover: bool,
    ) -> Result<RecoveredContinuedRasterRoom> {
        self.check()?;
        check_queued_rasters(staged_ids)?;
        self.rasters.check_new_rasters(staged_ids)?;
        Log::validate_segment_restoration(&self.native, active_generation)?;
        let state = self.native.checkpoint_state()?;
        let required_sources = state.recovered_discussion_source_digests();
        let sources = ClientSources::select(&required_sources, inputs)?;
        let staged_inputs = sources.staging_sources(staged_ids)?;
        if rollover {
            self.rasters.check_rollover_capacity()?;
            client_rasters::check_fresh_selection(&staged_inputs)?;
        } else {
            client_rasters::check_selected(
                &staged_inputs,
                self.identity.rasters.active(),
                self.rasters.active_entries(),
            )?;
        }
        let directory = self.directory.create_outside(path)?;
        let clients = sources.retain(&directory, &required_sources)?;
        let asset_path = directory.path.join("rasters");
        let mut assets = if rollover {
            self.rasters.rollover(&asset_path)?
        } else {
            self.rasters.restore(&asset_path)?
        };
        let rolled_active = rollover.then(|| assets.active_backup_identity()).transpose()?;
        let staged = StagedRasters::install(&mut assets, &staged_inputs)?;
        directory.guard()?;
        let (log, recovery) = Log::create_restored_segment(
            &directory.path.join("native"),
            self.native.clone(),
            active_generation,
        )?;
        if recovery.truncated_bytes != 0 {
            return Err(Error::Contract("continued raster room requires an exact native WAL"));
        }
        let (room, _) = Room::replay_relay_segment(log, recovery, state, false)?;
        let completed = Completion {
            format: FORMAT.into(),
            format_version: completion_revision(rollover, staged.is_some()),
            backup: self.identity.clone(),
            directory: directory.witness()?,
            native: room.log.segment_directory_witness()?,
            active_generation: active_generation.into(),
            rasters: assets.identity().clone(),
            clients: clients.selection(),
            staged,
            rollover: rolled_active,
        };
        self.check_target(&room, &assets, &clients, &completed)?;
        let bytes = files::encode(&completed)?;
        let identity = completion_identity(&bytes);
        files::insert(&directory, COMPLETE, &bytes)?;
        directory.guard_witness(&completed.directory)?;
        Ok(RecoveredContinuedRasterRoom { directory, room, assets, clients, identity, completed })
    }

    /// Reopen the exact unserved recovery cut. A fresh process must supply the independent
    /// local identity returned by restore as well as the original portable backup selection.
    ///
    /// # Errors
    /// Refuses changed or incomplete restores, replaced owners, active raster changes, native
    /// suffix records and retired or corrupt sources. No repair or publication is performed.
    pub fn reopen(
        &self,
        path: &Path,
        selected: &RecoveredContinuedRasterRoomIdentity,
    ) -> Result<RecoveredContinuedRasterRoom> {
        self.reopen_with_history(path, selected, false)
    }

    pub(crate) fn reopen_with_history(
        &self,
        path: &Path,
        selected: &RecoveredContinuedRasterRoomIdentity,
        serving_history: bool,
    ) -> Result<RecoveredContinuedRasterRoom> {
        let mode = if serving_history { ReplayMode::Serving } else { ReplayMode::Unserved };
        self.open_replayed(path, selected, mode).map(|(target, _)| target)
    }

    pub(super) fn open_replayed(
        &self,
        path: &Path,
        selected: &RecoveredContinuedRasterRoomIdentity,
        mode: ReplayMode<'_>,
    ) -> Result<(RecoveredContinuedRasterRoom, Recovery)> {
        self.check()?;
        let directory = GenerationDirectory::open(path)?;
        let path = directory.path.join(COMPLETE);
        GenerationFileWitness::of_metadata(&fs::symlink_metadata(&path)?)?;
        let completed: Completion = files::read(&path)?;
        if completed.backup != self.identity
            || completed.format != FORMAT
            || !completed.matches_revision()
            || &completion_identity(&files::encode(&completed)?) != selected
        {
            return Err(Error::Contract("continued raster room completion differs"));
        }
        directory.guard_witness(&completed.directory)?;
        let state = self.native.checkpoint_state()?;
        let clients = RetainedClients::reopen(
            &directory,
            &completed.clients,
            &state.recovered_discussion_source_digests(),
        )?;
        let (log, recovery) = Log::open_restored_segment_at(
            &directory.path.join("native"),
            &completed.native,
            self.native.clone(),
            &completed.active_generation,
        )?;
        let room = if let Some(floor) = mode.floor() {
            let current = log.generation_descriptor()?;
            let origin = &completed.backup.native.predecessor.source;
            let through: u64 = current.next_sequence.parse().map_err(|_| Error::NeedsRecovery)?;
            if floor.records < origin.records || floor.records > through {
                return Err(Error::Contract(
                    "continued native recovery floor is outside retained history",
                ));
            }
            let mut matched =
                floor.records == through && floor.terminal_log_digest == current.terminal_digest;
            let room = Room::replay_relay_segment_prefix(log, state, |record| {
                if record.sequence == floor.records {
                    matched = record.previous_digest() == floor.terminal_log_digest;
                }
                Ok(())
            })?;
            if !matched {
                return Err(Error::Contract("continued native recovery floor digest differs"));
            }
            room
        } else {
            if recovery.truncated_bytes != 0 {
                return Err(Error::Contract("continued raster room requires an exact native WAL"));
            }
            Room::replay_relay_segment(log, recovery, state, false)?.0
        };
        let raster_path = directory.path.join("rasters");
        let assets = match mode {
            ReplayMode::Unserved => ContinuedAssetStore::open(&raster_path, &completed.rasters)?,
            ReplayMode::PendingRaster(_) => {
                ContinuedAssetStore::open_for_raster_repair(&raster_path, &completed.rasters)?
            }
            ReplayMode::Serving | ReplayMode::NativeTail(_) => {
                ContinuedAssetStore::open_for_native_tail(&raster_path, &completed.rasters)?
            }
        };
        if matches!(mode, ReplayMode::Unserved) {
            self.check_target(&room, &assets, &clients, &completed)?;
        } else {
            let pending = if matches!(mode, ReplayMode::PendingRaster(_)) {
                assets.inspect_pending_upload()?
            } else {
                None
            };
            self.check_serving_history(
                &room,
                &assets,
                &clients,
                &completed,
                pending.as_ref().map(|file| file.file_name.as_str()),
            )?;
        }
        directory.guard_witness(&completed.directory)?;
        Ok((
            RecoveredContinuedRasterRoom {
                directory,
                room,
                assets,
                clients,
                identity: selected.clone(),
                completed,
            },
            recovery,
        ))
    }

    fn check_serving_history(
        &self,
        room: &Room,
        assets: &ContinuedAssetStore,
        clients: &RetainedClients,
        completed: &Completion,
        pending: Option<&str>,
    ) -> Result<()> {
        self.rasters.check_serving_prefix(
            assets,
            completed.staged_ids(),
            completed.rollover.is_some(),
            pending,
        )?;
        clients.check(&room.recovered_discussion_source_digests())?;
        self.check()
    }

    fn check_target(
        &self,
        room: &Room,
        assets: &ContinuedAssetStore,
        clients: &RetainedClients,
        completed: &Completion,
    ) -> Result<()> {
        room.log.check_fresh_segment_restoration(&completed.active_generation)?;
        if room.asset_binding() != assets.binding()
            || room.deployment_binding()? != self.identity.source_epoch.identity.binding
        {
            return Err(Error::Contract("restored continued raster room differs"));
        }
        check_queued_rasters(completed.staged_ids())?;
        self.rasters.check_active_extension(
            assets,
            completed.staged_ids(),
            completed.rollover.is_some(),
            completed.active_rasters(),
        )?;
        clients.check(&room.recovered_discussion_source_digests())?;
        self.check()
    }
}

pub(super) fn completion_identity(bytes: &[u8]) -> RecoveredContinuedRasterRoomIdentity {
    RecoveredContinuedRasterRoomIdentity { completion_sha256: Sha256::digest(bytes).into() }
}

impl RecoveredContinuedRasterRoom {
    /// Whether this restore seals the captured active raster generation into the retained pack.
    #[must_use]
    pub const fn rolled_raster_generation(&self) -> bool {
        self.completed.rollover.is_some()
    }

    pub(crate) fn check_exact_restored_cut(&self) -> Result<()> {
        self.directory.guard_witness(&self.completed.directory)?;
        check_completion(&self.directory, &self.identity)?;
        if self.room.log.segment_directory_witness()? != self.completed.native
            || self.assets.identity() != &self.completed.rasters
        {
            return Err(Error::Contract("continued raster room completion differs"));
        }
        self.room.log.check_fresh_segment_restoration(&self.completed.active_generation)?;
        if self.assets.active_backup_identity()? != *self.completed.active_rasters() {
            return Err(Error::Contract("restored continued assets advanced"));
        }
        self.clients.check(&self.room.recovered_discussion_source_digests())?;
        self.directory.guard()
    }
}

pub(super) fn check_completion(
    directory: &GenerationDirectory,
    identity: &RecoveredContinuedRasterRoomIdentity,
) -> Result<()> {
    let completion = directory.path.join(COMPLETE);
    GenerationFileWitness::of_metadata(&fs::symlink_metadata(&completion)?)?;
    let selected: Completion = files::read(&completion)?;
    if completion_identity(&files::encode(&selected)?) != *identity {
        return Err(Error::Contract("continued raster room completion differs"));
    }
    Ok(())
}
