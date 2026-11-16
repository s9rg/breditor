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
    pub(super) staged: Option<StagedRasters>,
}

impl Completion {
    fn active_rasters(&self) -> &AssetBackupIdentity {
        self.staged.as_ref().map_or_else(|| self.backup.rasters.active(), |staged| &staged.active)
    }

    fn matches_revision(&self) -> bool {
        match (self.format_version, &self.staged) {
            (1, None) => true,
            (2, Some(staged)) => !staged.ids.is_empty(),
            _ => false,
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
        self.check()?;
        check_queued_rasters(staged_ids)?;
        self.rasters.check_new_rasters(staged_ids)?;
        Log::validate_segment_restoration(&self.native, active_generation)?;
        let state = self.native.checkpoint_state()?;
        let required_sources = state.recovered_discussion_source_digests();
        let sources = ClientSources::select(&required_sources, inputs)?;
        let staged_inputs = sources.staging_sources(staged_ids)?;
        client_rasters::check_selected(
            &staged_inputs,
            self.identity.rasters.active(),
            self.rasters.active_entries(),
        )?;
        let directory = self.directory.create_outside(path)?;
        let clients = sources.retain(&directory, &required_sources)?;
        let mut assets = self.rasters.restore(&directory.path.join("rasters"))?;
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
            format_version: if staged.is_some() { 2 } else { 1 },
            backup: self.identity.clone(),
            directory: directory.witness()?,
            native: room.log.segment_directory_witness()?,
            active_generation: active_generation.into(),
            rasters: assets.identity().clone(),
            clients: clients.selection(),
            staged,
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
        self.open_replayed(path, selected, serving_history, None).map(|(target, _)| target)
    }

    pub(super) fn open_replayed(
        &self,
        path: &Path,
        selected: &RecoveredContinuedRasterRoomIdentity,
        serving_history: bool,
        floor: Option<&RoomBackupIdentity>,
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
        let room = if let Some(floor) = floor {
            if !serving_history {
                return Err(Error::Contract("native prefix inspection requires activated history"));
            }
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
        let assets = if floor.is_some() {
            ContinuedAssetStore::open_for_native_tail(&raster_path, &completed.rasters)?
        } else {
            ContinuedAssetStore::open(&raster_path, &completed.rasters)?
        };
        if serving_history {
            self.check_serving_history(&room, &assets, &clients, &completed)?;
        } else {
            self.check_target(&room, &assets, &clients, &completed)?;
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
    ) -> Result<()> {
        self.rasters.check_serving_prefix(
            assets,
            completed.staged.as_ref().map_or(&[], |staged| staged.ids.as_slice()),
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
        match &completed.staged {
            Some(staged) => staged.verify(&self.rasters, assets)?,
            None => {
                assets.check_selected_cut(&self.identity.rasters, completed.active_rasters())?;
            }
        }
        clients.check(&room.recovered_discussion_source_digests())?;
        self.check()
    }
}

pub(super) fn completion_identity(bytes: &[u8]) -> RecoveredContinuedRasterRoomIdentity {
    RecoveredContinuedRasterRoomIdentity { completion_sha256: Sha256::digest(bytes).into() }
}

impl RecoveredContinuedRasterRoom {
    pub(crate) fn check_exact_restored_cut(&self) -> Result<()> {
        self.directory.guard_witness(&self.completed.directory)?;
        check_completion(&self.directory, &self.identity)?;
        if self.room.log.segment_directory_witness()? != self.completed.native
            || self.assets.identity() != &self.completed.rasters
        {
            return Err(Error::Contract("continued raster room completion differs"));
        }
        self.room.log.check_fresh_segment_restoration(&self.completed.active_generation)?;
        self.assets
            .check_selected_cut(&self.completed.backup.rasters, self.completed.active_rasters())?;
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
