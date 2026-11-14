//! Absent-only whole-room restore, followed by explicit reopen of exact committed owners.
use super::{
    RecoveredRelaySegmentRoom, RelaySegmentRoomBackupFiles, RelaySegmentRoomBackupIdentity,
};
use crate::{
    Error, Result, Room, RoomRecoveryPolicy,
    assets::AssetStore,
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
        let RoomRecoveryPolicy::HostReacquired = policy;
        self.check()?;
        Log::validate_segment_restoration(&self.native, active_generation)?;
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
        let (assets, raster) = raster_directory.into_store(&self.identity.assets.binding)?;
        if assets.prepare_backup_stream()?.identity != self.identity.assets {
            return Err(Error::Contract("restored raster archive differs"));
        }
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
            format_version: 1,
            backup: self.identity.clone(),
            root: directory.witness()?,
            native,
            raster: raster_witness,
            active: active_generation.to_owned(),
        };
        files::insert(&directory, COMPLETE, &files::encode(&completed)?)?;
        directory.guard()?;
        Ok(RecoveredRelaySegmentRoom {
            room,
            assets,
            raster,
            directory,
            #[cfg(feature = "server")]
            backup: completed.backup,
            #[cfg(feature = "server")]
            active: completed.active,
        })
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
        if completed.format_version != 1 || completed.backup != self.identity {
            return Err(Error::Contract("relay segment room completion differs"));
        }
        directory.guard_witness(&completed.root)?;
        let raster_directory =
            RasterDirectory::open(&directory.path.join("rasters"), &completed.raster)?;
        let (assets, raster) = raster_directory.into_store(&self.identity.assets.binding)?;
        assets.prepare_backup_stream()?.check_retains(&self.identity.assets, &self.entries)?;
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
        Ok(RecoveredRelaySegmentRoom {
            room,
            assets,
            raster,
            directory,
            #[cfg(feature = "server")]
            backup: completed.backup,
            #[cfg(feature = "server")]
            active: completed.active,
        })
    }
}

impl RecoveredRelaySegmentRoom {
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
        self.raster.guard(&self.assets)
    }
}
