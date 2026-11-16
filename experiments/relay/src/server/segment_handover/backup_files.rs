//! Verify portable file bytes and retain their named custody until backup confirmation.
use super::capture::{CHECKPOINT, NATIVE, RASTERS};
use crate::{
    Error, RelaySegmentBaseFile, RelaySegmentRoomBackupFiles, RelaySegmentRoomBackupIdentity,
    Result,
    archive_input::ArchiveInput,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{
    fs::File,
    io::{self, Write},
    path::Path,
    sync::Arc,
};

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

pub(super) struct BackupCopyInput<'a> {
    directory: &'a GenerationDirectory,
    name: &'a str,
    input: ArchiveInput,
    witness: GenerationFileWitness,
}

impl<'a> BackupCopyInput<'a> {
    pub(super) fn open(
        directory: &'a GenerationDirectory,
        name: &'a str,
        limit: u64,
    ) -> Result<Self> {
        let file = read_owned(directory, name)?;
        let witness = GenerationFileWitness::of(&file)?;
        let input = ArchiveInput::new(file, limit)?;
        Ok(Self { directory, name, input, witness })
    }

    pub(super) fn len(&self) -> u64 {
        self.input.all().len()
    }

    pub(super) fn write(&self, output: &mut dyn Write) -> Result<()> {
        self.check()?;
        if io::copy(&mut self.input.all().reader(), output)? != self.len() {
            return Err(Error::Contract("portable backup source copy was truncated"));
        }
        self.check()
    }

    fn check(&self) -> Result<()> {
        self.directory.guard()?;
        self.input.check_named(&self.witness, &self.directory.path.join(self.name))
    }
}

pub(super) fn copy_file(
    source: &GenerationDirectory,
    destination: &GenerationDirectory,
    name: &str,
    limit: u64,
) -> Result<()> {
    let input = BackupCopyInput::open(source, name, limit)?;
    let mut output = destination.create_file(name, &[])?;
    input.write(&mut output)?;
    output.sync_all()?;
    Ok(())
}

pub(super) fn copy_group(
    source: &GenerationDirectory,
    destination: &GenerationDirectory,
    folder: &str,
    extension: &str,
    lengths: impl ExactSizeIterator<Item = u64>,
) -> Result<()> {
    if lengths.len() == 0 {
        return Ok(());
    }
    let source = GenerationDirectory::open(&source.path.join(folder))?;
    let destination = GenerationDirectory::create(&destination.path.join(folder))?;
    for (index, limit) in lengths.enumerate() {
        copy_file(&source, &destination, &entry_name(index, extension), limit)?;
    }
    destination.sync()
}

pub(super) fn write_group(
    root: &GenerationDirectory,
    output: &mut impl Write,
    folder: &str,
    extension: &str,
    lengths: impl ExactSizeIterator<Item = u64>,
) -> Result<()> {
    if lengths.len() == 0 {
        return Ok(());
    }
    let source = GenerationDirectory::open(&root.path.join(folder))?;
    for (index, length) in lengths.enumerate() {
        let name = entry_name(index, extension);
        let input = BackupCopyInput::open(&source, &name, length)?;
        if input.len() != length {
            return Err(Error::Contract("retained client archive length differs"));
        }
        input.write(output)?;
    }
    source.guard()
}

fn entry_name(index: usize, extension: &str) -> String {
    format!("{index}.{extension}")
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
                let name = entry_name(index, extension);
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
