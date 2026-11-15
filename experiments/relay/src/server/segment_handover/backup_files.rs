//! Verify portable file bytes and retain their named custody until backup confirmation.
use super::capture::{CHECKPOINT, NATIVE, RASTERS};
use crate::{
    Error, RelaySegmentBaseFile, RelaySegmentRoomBackupFiles, RelaySegmentRoomBackupIdentity,
    Result,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{fs::File, path::Path, sync::Arc};

pub(super) fn open_room(
    directory: &GenerationDirectory,
    parent: Option<Arc<RelaySegmentBaseFile>>,
    expected: &RelaySegmentRoomBackupIdentity,
) -> Result<RelaySegmentRoomBackupFiles> {
    Ok(RoomBackupCopies::open(directory, parent, expected)?.backup)
}

pub(super) struct RoomBackupCopies {
    pub(super) backup: RelaySegmentRoomBackupFiles,
    native: GenerationFileWitness,
    checkpoint: GenerationFileWitness,
    rasters: GenerationFileWitness,
}

impl RoomBackupCopies {
    pub(super) fn open(
        directory: &GenerationDirectory,
        parent: Option<Arc<RelaySegmentBaseFile>>,
        expected: &RelaySegmentRoomBackupIdentity,
    ) -> Result<Self> {
        let native = read_owned(directory, NATIVE)?;
        let checkpoint = read_owned(directory, CHECKPOINT)?;
        let rasters = read_owned(directory, RASTERS)?;
        let native_witness = GenerationFileWitness::of(&native)?;
        let checkpoint_witness = GenerationFileWitness::of(&checkpoint)?;
        let raster_witness = GenerationFileWitness::of(&rasters)?;
        let base = match parent {
            Some(parent) => {
                RelaySegmentBaseFile::open_linked(native, checkpoint, &expected.native, parent)?
            }
            None => RelaySegmentBaseFile::open(native, checkpoint, &expected.native)?,
        };
        let copies = Self {
            backup: RelaySegmentRoomBackupFiles::open(Arc::new(base), rasters, expected)?,
            native: native_witness,
            checkpoint: checkpoint_witness,
            rasters: raster_witness,
        };
        copies.check(directory)?;
        Ok(copies)
    }

    pub(super) fn check(&self, directory: &GenerationDirectory) -> Result<()> {
        directory.guard()?;
        self.backup.check_named(
            (&self.native, &directory.path.join(NATIVE)),
            (&self.checkpoint, &directory.path.join(CHECKPOINT)),
            (&self.rasters, &directory.path.join(RASTERS)),
        )?;
        directory.guard()
    }
}

pub(super) fn read_owned(directory: &GenerationDirectory, name: &str) -> Result<File> {
    directory.guard()?;
    let path = directory.path.join(name);
    if !std::fs::symlink_metadata(&path)?.is_file() {
        return Err(Error::Contract("relay portable backup requires a regular file"));
    }
    let file = File::open(&path)?;
    GenerationFileWitness::of(&file)?.guard(&file, &path)?;
    Ok(file)
}

type CheckNamed<T> = fn(&T, &GenerationFileWitness, &Path) -> Result<()>;

struct Entry<T> {
    name: String,
    witness: GenerationFileWitness,
    value: T,
}

pub(super) struct BackupCopies<T> {
    directory: Option<GenerationDirectory>,
    entries: Vec<Entry<T>>,
    check_named: CheckNamed<T>,
}

impl<T> BackupCopies<T> {
    pub(super) fn open<P: Clone>(
        root: &GenerationDirectory,
        folder: &str,
        extension: &str,
        pins: &[P],
        open: fn(File, P) -> Result<T>,
        check_named: CheckNamed<T>,
    ) -> Result<Self> {
        if pins.is_empty() {
            return Ok(Self { directory: None, entries: Vec::new(), check_named });
        }
        let directory = GenerationDirectory::open(&root.path.join(folder))?;
        let entries = pins
            .iter()
            .enumerate()
            .map(|(index, pin)| {
                let name = format!("{index}.{extension}");
                let file = read_owned(&directory, &name)?;
                let witness = GenerationFileWitness::of(&file)?;
                Ok(Entry { name, witness, value: open(file, pin.clone())? })
            })
            .collect::<Result<Vec<_>>>()?;
        let copies = Self { directory: Some(directory), entries, check_named };
        copies.check()?;
        Ok(copies)
    }

    pub(super) fn check(&self) -> Result<()> {
        let Some(directory) = &self.directory else {
            return Ok(());
        };
        directory.guard()?;
        for entry in &self.entries {
            (self.check_named)(&entry.value, &entry.witness, &directory.path.join(&entry.name))?;
        }
        directory.guard()
    }

    pub(super) fn into_values(self) -> Vec<T> {
        self.entries.into_iter().map(|entry| entry.value).collect()
    }
}
