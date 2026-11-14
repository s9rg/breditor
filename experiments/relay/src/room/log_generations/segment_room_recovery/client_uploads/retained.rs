//! No-overwrite retention and real file custody for each complete original queue.
use super::{RelaySegmentClientUploadArchive, RelaySegmentClientUploadPin, check_pins, codec};
use crate::{
    Error, Result,
    archive_input::ArchiveInput,
    log::generations::{GenerationDirectory, GenerationDirectoryWitness, GenerationFileWitness},
    room::log_generations::recovery::files,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs::File, io};

const ROOT: &str = "client-uploads";
const MANIFEST: &str = "manifest.json";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::room::log_generations::segment_room_recovery) struct RetainedUploadSelection {
    directory: GenerationDirectoryWitness,
    sha256: [u8; 32],
}

struct HeldArchive {
    witness: GenerationFileWitness,
    file: ArchiveInput,
    pin: RelaySegmentClientUploadPin,
}

pub(in crate::room::log_generations::segment_room_recovery) struct RetainedUploads {
    directory: GenerationDirectory,
    selection: RetainedUploadSelection,
    archives: Vec<HeldArchive>,
}

impl RetainedUploads {
    pub fn create(
        root: &GenerationDirectory,
        sources: &[RelaySegmentClientUploadArchive],
    ) -> Result<Self> {
        let directory = GenerationDirectory::create(&root.path.join(ROOT))?;
        let pins = sources.iter().map(|source| source.pin.clone()).collect::<Vec<_>>();
        let manifest = files::encode(&pins)?;
        let mut archives = Vec::with_capacity(sources.len());
        for source in sources {
            source.file.check()?;
            let mut file = directory.create_file(&source.pin.name(), &[])?;
            if io::copy(&mut source.file.all().reader(), &mut file)? != source.pin.bytes {
                return Err(Error::Contract("client upload archive truncated during retention"));
            }
            file.sync_all()?;
            let held = HeldArchive::open(file, source.pin.clone())?;
            source.file.check()?;
            archives.push(held);
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
            let file = files::open(&directory.path.join(pin.name()))?;
            archives.push(HeldArchive::open(file, pin)?);
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
            entry.file.check_named(&entry.witness, &path)?;
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
        entry.witness.guard(&file, &path)?;
        let compare = ArchiveInput::new(file.try_clone()?, codec::MAX_FILE)?;
        entry.pin.check_file(compare.all())?;
        compare.check()?;
        self.check()?;
        Ok(Some(file))
    }
}

impl HeldArchive {
    fn open(file: File, pin: RelaySegmentClientUploadPin) -> Result<Self> {
        let witness = GenerationFileWitness::of(&file)?;
        let file = ArchiveInput::new(file, codec::MAX_FILE)?;
        pin.check_file(file.all())?;
        file.check()?;
        Ok(Self { witness, file, pin })
    }
}
