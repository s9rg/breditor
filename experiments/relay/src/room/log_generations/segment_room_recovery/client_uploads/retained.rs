//! No-overwrite retention of exact queue files under one exclusively held directory.
use super::{RelaySegmentClientUploadPin, UploadSource, check_pins, codec};
use crate::{
    Error, Result,
    archive_input::ArchiveInput,
    log::generations::{
        GenerationDirectory, GenerationDirectoryWitness, GenerationFileStamp, GenerationFileWitness,
    },
    room::log_generations::recovery::files,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, Metadata},
    io,
    path::Path,
};

const ROOT: &str = "client-uploads";
const MANIFEST: &str = "manifest.json";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room::log_generations::segment_room_recovery) struct RetainedUploadSelection {
    directory: GenerationDirectoryWitness,
    sha256: [u8; 32],
}

// The directory owner serializes recovery. Check the admitted file identity and
// change stamp under that custody, and verify the exact digest on every byte read.
struct RetainedArchive {
    witness: GenerationFileWitness,
    stamp: GenerationFileStamp,
    pin: RelaySegmentClientUploadPin,
}

pub(in crate::room::log_generations::segment_room_recovery) struct RetainedUploads {
    directory: GenerationDirectory,
    selection: RetainedUploadSelection,
    archives: Vec<RetainedArchive>,
}

impl RetainedUploads {
    pub fn create(root: &GenerationDirectory, sources: &[UploadSource<'_>]) -> Result<Self> {
        let directory = GenerationDirectory::create(&root.path.join(ROOT))?;
        let pins = sources.iter().map(|source| source.pin.clone()).collect::<Vec<_>>();
        let manifest = files::encode(&pins)?;
        let mut archives = Vec::with_capacity(sources.len());
        for source in sources {
            source.bytes.check()?;
            let name = source.pin.name();
            let mut file = directory.create_file(&name, &[])?;
            if io::copy(&mut source.bytes.reader(), &mut file)? != source.pin.bytes {
                return Err(Error::Contract("client upload archive truncated during retention"));
            }
            file.sync_all()?;
            let retained =
                RetainedArchive::admit(file, &directory.path.join(name), source.pin.clone())?;
            source.bytes.check()?;
            archives.push(retained);
        }
        let selection = RetainedUploadSelection {
            directory: directory.witness()?,
            sha256: Sha256::digest(&manifest).into(),
        };
        files::insert(&directory, MANIFEST, &manifest)?;
        let retained = Self { directory, selection, archives };
        retained.check()?;
        Ok(retained)
    }

    pub fn reopen(root: &GenerationDirectory, expected: &RetainedUploadSelection) -> Result<Self> {
        let directory = GenerationDirectory::open(&root.path.join(ROOT))?;
        directory.guard_witness(&expected.directory)?;
        let pins: Vec<RelaySegmentClientUploadPin> = files::read(&directory.path.join(MANIFEST))?;
        check_pins(&pins)?;
        if <[u8; 32]>::from(Sha256::digest(files::encode(&pins)?)) != expected.sha256 {
            return Err(Error::Contract("client upload archive retained manifest changed"));
        }
        let mut archives = Vec::with_capacity(pins.len());
        for pin in pins {
            let path = directory.path.join(pin.name());
            GenerationFileWitness::of_metadata(&fs::symlink_metadata(&path)?)?;
            let file = files::open(&path)?;
            archives.push(RetainedArchive::admit(file, &path, pin)?);
        }
        let selection =
            RetainedUploadSelection { directory: directory.witness()?, sha256: expected.sha256 };
        let retained = Self { directory, selection, archives };
        retained.check()?;
        Ok(retained)
    }

    pub fn selection(&self) -> &RetainedUploadSelection {
        &self.selection
    }

    pub fn pins(&self) -> impl Iterator<Item = &RelaySegmentClientUploadPin> {
        self.archives.iter().map(|archive| &archive.pin)
    }

    pub fn check(&self) -> Result<()> {
        self.directory.guard_witness(&self.selection.directory)?;
        let pins = self.pins().collect::<Vec<_>>();
        let expected = files::encode(&pins)?;
        let actual: Vec<RelaySegmentClientUploadPin> =
            files::read(&self.directory.path.join(MANIFEST))?;
        if files::encode(&actual)? != expected {
            return Err(Error::Contract("client upload archive retained manifest changed"));
        }
        for entry in &self.archives {
            let path = self.directory.path.join(entry.pin.name());
            entry.check_path(&path)?;
        }
        self.directory.guard()
    }

    pub fn read(&self, writer: &str) -> Result<Option<File>> {
        self.check()?;
        let Some(entry) = self.archives.iter().find(|archive| archive.pin.writer == writer) else {
            return Ok(None);
        };
        let path = self.directory.path.join(entry.pin.name());
        let file = File::open(&path)?;
        entry.open_bytes(file.try_clone()?, &path)?;
        self.check()?;
        Ok(Some(file))
    }

    #[cfg(feature = "server")]
    fn standalone<'a>(
        &'a self,
        embedded_writers: &'a std::collections::BTreeSet<&str>,
    ) -> impl Iterator<Item = &'a RetainedArchive> {
        self.archives.iter().filter(|entry| !embedded_writers.contains(entry.pin.writer.as_str()))
    }

    #[cfg(feature = "server")]
    pub fn write_standalone(
        &self,
        output: &mut impl std::io::Write,
        embedded_writers: &std::collections::BTreeSet<&str>,
    ) -> Result<Vec<RelaySegmentClientUploadPin>> {
        self.check()?;
        let mut pins = Vec::new();
        for entry in self.standalone(embedded_writers) {
            entry.copy_to(&self.directory.path.join(entry.pin.name()), output)?;
            pins.push(entry.pin.clone());
        }
        self.check()?;
        Ok(pins)
    }

    #[cfg(feature = "server")]
    pub fn export_standalone(
        &self,
        destination: &Path,
        embedded_writers: &std::collections::BTreeSet<&str>,
    ) -> Result<Vec<RelaySegmentClientUploadPin>> {
        self.check()?;
        let mut entries = self.standalone(embedded_writers).peekable();
        if entries.peek().is_none() {
            return Ok(Vec::new());
        }
        let directory = GenerationDirectory::create(destination)?;
        let mut pins = Vec::new();
        for (index, entry) in entries.enumerate() {
            let name = format!("{index}.uploads");
            let mut output = directory.create_file(&name, &[])?;
            entry.copy_to(&self.directory.path.join(entry.pin.name()), &mut output)?;
            output.sync_all()?;
            GenerationFileWitness::of(&output)?.guard(&output, &directory.path.join(&name))?;
            pins.push(entry.pin.clone());
        }
        directory.sync()?;
        directory.guard()?;
        self.check()?;
        Ok(pins)
    }
}

impl RetainedArchive {
    #[cfg(feature = "server")]
    fn copy_to(&self, path: &Path, output: &mut impl std::io::Write) -> Result<()> {
        self.check_path(path)?;
        let file = self.open_bytes(File::open(path)?, path)?;
        if io::copy(&mut file.all().reader(), output)? != self.pin.bytes {
            return Err(Error::Contract("retained upload export truncated"));
        }
        file.check_named(&self.witness, path)?;
        self.check_path(path)
    }

    fn admit(file: File, path: &Path, pin: RelaySegmentClientUploadPin) -> Result<Self> {
        let metadata = file.metadata()?;
        let retained = Self {
            witness: GenerationFileWitness::of_metadata(&metadata)?,
            stamp: GenerationFileStamp::of_metadata(&metadata)?,
            pin,
        };
        retained.open_bytes(file, path)?;
        Ok(retained)
    }

    fn check_path(&self, path: &Path) -> Result<()> {
        self.check_metadata(&fs::symlink_metadata(path)?)
    }

    fn check_metadata(&self, metadata: &Metadata) -> Result<()> {
        if GenerationFileWitness::of_metadata(metadata)? != self.witness
            || GenerationFileStamp::of_metadata(metadata)? != self.stamp
            || metadata.len() != self.pin.bytes
        {
            return Err(Error::Contract("retained client upload archive custody changed"));
        }
        Ok(())
    }

    fn open_bytes(&self, file: File, path: &Path) -> Result<ArchiveInput> {
        self.check_metadata(&file.metadata()?)?;
        let file = ArchiveInput::new(file, codec::MAX_FILE)?;
        self.pin.check_file(file.all())?;
        file.check_named(&self.witness, path)?;
        self.check_path(path)?;
        Ok(file)
    }
}
