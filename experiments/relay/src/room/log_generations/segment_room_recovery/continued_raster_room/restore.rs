//! Restore only into an absent directory and write completion after every owner has synced.
use super::{
    ContinuedRasterRoomBackupFiles, ContinuedRasterRoomClientArchives,
    RecoveredContinuedRasterRoom, RecoveredContinuedRasterRoomIdentity,
    clients::{ClientSelection, RetainedClients},
};
use crate::{
    ContinuedAssetStore, ContinuedAssetStoreIdentity, Error, Result, Room,
    log::{
        Log,
        generations::{GenerationDirectory, GenerationDirectoryWitness, GenerationFileWitness},
    },
    room::log_generations::recovery::files,
    server::ContinuedRasterRoomBackupIdentity,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

const COMPLETE: &str = ".continued-raster-room-complete.json";
const FORMAT: &str = "breditor/recovered-continued-raster-room";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Completion {
    format: String,
    format_version: u32,
    pub(super) backup: ContinuedRasterRoomBackupIdentity,
    directory: GenerationDirectoryWitness,
    native: GenerationDirectoryWitness,
    active_generation: String,
    rasters: ContinuedAssetStoreIdentity,
    clients: ClientSelection,
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
        self.check()?;
        Log::validate_segment_restoration(&self.native, active_generation)?;
        let state = self.native.checkpoint_state()?;
        let (directory, clients) =
            RetainedClients::create(&state.recovered_discussion_source_digests(), inputs, || {
                self.directory.create_outside(path)
            })?;
        let assets = self.rasters.restore(&directory.path.join("rasters"))?;
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
            format_version: 1,
            backup: self.identity.clone(),
            directory: directory.witness()?,
            native: room.log.segment_directory_witness()?,
            active_generation: active_generation.into(),
            rasters: assets.identity().clone(),
            clients: clients.selection(),
        };
        self.check_target(&room, &assets, &clients, &completed.active_generation)?;
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
        self.check()?;
        let directory = GenerationDirectory::open(path)?;
        let path = directory.path.join(COMPLETE);
        GenerationFileWitness::of_metadata(&fs::symlink_metadata(&path)?)?;
        let completed: Completion = files::read(&path)?;
        if completed.backup != self.identity
            || completed.format != FORMAT
            || completed.format_version != 1
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
        let assets =
            ContinuedAssetStore::open(&directory.path.join("rasters"), &completed.rasters)?;
        let (log, recovery) = Log::open_restored_segment_at(
            &directory.path.join("native"),
            &completed.native,
            self.native.clone(),
            &completed.active_generation,
        )?;
        if recovery.truncated_bytes != 0 {
            return Err(Error::Contract("continued raster room requires an exact native WAL"));
        }
        let (room, _) = Room::replay_relay_segment(log, recovery, state, false)?;
        self.check_target(&room, &assets, &clients, &completed.active_generation)?;
        directory.guard_witness(&completed.directory)?;
        Ok(RecoveredContinuedRasterRoom {
            directory,
            room,
            assets,
            clients,
            identity: selected.clone(),
            completed,
        })
    }

    fn check_target(
        &self,
        room: &Room,
        assets: &ContinuedAssetStore,
        clients: &RetainedClients,
        active: &str,
    ) -> Result<()> {
        room.log.check_fresh_segment_restoration(active)?;
        if room.asset_binding() != assets.binding()
            || room.deployment_binding()? != self.identity.source_epoch.identity.binding
        {
            return Err(Error::Contract("restored continued raster room differs"));
        }
        assets.check_backup_cut(&self.identity.rasters)?;
        clients.check(&room.recovered_discussion_source_digests())?;
        self.check()
    }
}

fn completion_identity(bytes: &[u8]) -> RecoveredContinuedRasterRoomIdentity {
    RecoveredContinuedRasterRoomIdentity { completion_sha256: Sha256::digest(bytes).into() }
}

impl RecoveredContinuedRasterRoom {
    pub(crate) fn check_exact_restored_cut(&self) -> Result<()> {
        self.directory.guard_witness(&self.completed.directory)?;
        let completion = self.directory.path.join(COMPLETE);
        GenerationFileWitness::of_metadata(&fs::symlink_metadata(&completion)?)?;
        let selected: Completion = files::read(&completion)?;
        if completion_identity(&files::encode(&selected)?) != self.identity
            || self.room.log.segment_directory_witness()? != self.completed.native
            || self.assets.identity() != &self.completed.rasters
        {
            return Err(Error::Contract("continued raster room completion differs"));
        }
        self.room.log.check_fresh_segment_restoration(&self.completed.active_generation)?;
        self.assets.check_backup_cut(&self.completed.backup.rasters)?;
        self.clients.check(&self.room.recovered_discussion_source_digests())?;
        self.directory.guard()
    }
}
