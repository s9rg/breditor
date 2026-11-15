//! Stream to a private, absent-only capture directory under the live serving epoch.
use crate::{
    Error, RelaySegmentRoomBackupIdentity, Result,
    log::generations::{GenerationDirectory, GenerationFileStamp, GenerationFileWitness},
    server::{Host, RoomDeploymentSelection, ServerBackupHandle, deployment_fence},
};
use std::{collections::BTreeSet, fs::File, path::Path};

pub(super) const NATIVE: &str = "native.archive";
pub(super) const CHECKPOINT: &str = "native.checkpoint";
pub(super) const RASTERS: &str = "rasters.archive";

pub(super) struct CapturedSegment {
    pub backup: RelaySegmentRoomBackupIdentity,
    pub directory: GenerationDirectory,
    pub discussion_sources: BTreeSet<[u8; 32]>,
    files: [CapturedFile; 3],
}

struct CapturedFile {
    name: &'static str,
    file: File,
    witness: GenerationFileWitness,
    stamp: GenerationFileStamp,
}

impl CapturedFile {
    fn synced(name: &'static str, file: File) -> Result<Self> {
        file.sync_all()?;
        let witness = GenerationFileWitness::of(&file)?;
        let stamp = GenerationFileStamp::of(&file)?;
        Ok(Self { name, file, witness, stamp })
    }
}

impl CapturedSegment {
    pub(super) fn check(&self, host: &Host) -> Result<()> {
        self.directory.guard()?;
        for file in &self.files {
            file.witness.guard(&file.file, &self.directory.path.join(file.name))?;
            file.stamp.guard(&file.file)?;
        }
        if let Some(custody) = &host.relay_segment_custody {
            custody.check()?;
        }
        Ok(())
    }
}

pub(super) fn capture(host: &Host, principal: &str, destination: &Path) -> Result<CapturedSegment> {
    if let Some(custody) = &host.relay_segment_custody {
        custody.check()?;
    }
    let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
    room.recovery_inventory_owner(principal)?;
    room.log_generation_descriptor(principal)?;
    let assets = host.assets.as_ref().ok_or(Error::NeedsRecovery)?;
    let assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
    let directory = GenerationDirectory::create(destination)?;
    let mut native = directory.create_file(NATIVE, &[])?;
    let mut checkpoint = directory.create_file(CHECKPOINT, &[])?;
    let mut raster = directory.create_file(RASTERS, &[])?;
    let backup = room.write_relay_segment_room_backup(
        principal,
        &assets,
        &mut native,
        &mut checkpoint,
        &mut raster,
    )?;
    let discussion_sources = room.recovered_discussion_source_digests();
    let capture = CapturedSegment {
        backup,
        directory,
        discussion_sources,
        files: [
            CapturedFile::synced(NATIVE, native)?,
            CapturedFile::synced(CHECKPOINT, checkpoint)?,
            CapturedFile::synced(RASTERS, raster)?,
        ],
    };
    capture.directory.sync()?;
    capture.check(host)?;
    Ok(capture)
}

impl ServerBackupHandle {
    /// Capture the complete terminal native archive, checkpoint and raster store from a fenced host.
    /// Syncs `native.archive`, `native.checkpoint` and `rasters.archive` in an absent destination.
    /// Keep earlier native segments separately. Persist the returned identity and source epoch.
    ///
    /// # Errors
    /// Refuses non-owner calls, noncurrent leases, occupied paths and uncertain files.
    /// A failed capture may leave an incomplete directory. Retry at a new path.
    pub fn capture_relay_segment(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<(RelaySegmentRoomBackupIdentity, RoomDeploymentSelection)> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        host.deployment.fenced(|lease| {
            deployment_fence::transaction(Some(lease), || {
                let capture = capture(host, principal, destination)?;
                Ok((capture.backup, lease.selection()))
            })
        })
    }
}
