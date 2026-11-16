//! Verify the four named files and the optional native parent before allocating a target.
use super::{ContinuedAssetBackupFiles, ContinuedRasterRoomBackupFiles};
use crate::{
    Error, RelaySegmentBaseFile, Result,
    log::generations::{GenerationDirectory, GenerationFileWitness},
    server::ContinuedRasterRoomBackupIdentity,
};
use std::{
    fs::{self, File},
    path::Path,
    sync::Arc,
};

const NAMES: [&str; 4] = [
    "native.archive",
    "native.checkpoint",
    "rasters-predecessor.archive",
    "rasters-active.archive",
];

pub(super) struct CaptureFiles([(File, GenerationFileWitness); 4]);

impl CaptureFiles {
    fn open(directory: &GenerationDirectory) -> Result<Self> {
        // Each named path and the held inode must be private and regular.
        let file = |name: &str| {
            let path = directory.path.join(name);
            let witness = GenerationFileWitness::of_metadata(&fs::symlink_metadata(&path)?)?;
            let held = File::open(&path)?;
            witness.guard(&held, &path)?;
            Ok::<_, Error>((held, witness))
        };
        let [wal, checkpoint, predecessor, active] = NAMES;
        Ok(Self([file(wal)?, file(checkpoint)?, file(predecessor)?, file(active)?]))
    }

    fn guard(&self, directory: &GenerationDirectory) -> Result<()> {
        for (name, (file, witness)) in NAMES.into_iter().zip(&self.0) {
            witness.guard(file, &directory.path.join(name))?;
        }
        directory.guard()
    }
}

impl ContinuedRasterRoomBackupFiles {
    /// Open the captured directory against a separately saved exact selection. Supply the
    /// independently admitted native parent chain if the source was a linked WAL segment.
    /// A portable copy can have fresh inodes. Keep its files private and immutable after opening.
    ///
    /// # Errors
    /// Refuses mixed or changed cuts, malformed or missing files and divergent native ancestry.
    pub fn open(
        path: &Path,
        selected: &ContinuedRasterRoomBackupIdentity,
        parent: Option<Arc<RelaySegmentBaseFile>>,
    ) -> Result<Self> {
        selected.check_selection()?;
        let directory = GenerationDirectory::open(path)?;
        let files = CaptureFiles::open(&directory)?;
        let [(wal, _), (checkpoint, _), (predecessor, _), (active, _)] = &files.0;
        let wal = wal.try_clone()?;
        let checkpoint = checkpoint.try_clone()?;
        let native = Arc::new(match parent {
            Some(parent) => {
                RelaySegmentBaseFile::open_linked(wal, checkpoint, &selected.native, parent)?
            }
            None => RelaySegmentBaseFile::open(wal, checkpoint, &selected.native)?,
        });
        let rasters = ContinuedAssetBackupFiles::admit(
            predecessor.try_clone()?,
            active.try_clone()?,
            &selected.rasters,
        )?;
        let backup = Self { identity: selected.clone(), directory, native, rasters, files };
        backup.check()?;
        Ok(backup)
    }

    pub(crate) fn selection(&self) -> &ContinuedRasterRoomBackupIdentity {
        &self.identity
    }

    pub(crate) fn check(&self) -> Result<()> {
        self.files.guard(&self.directory)?;
        self.native.check()?;
        self.rasters.check()
    }
}
