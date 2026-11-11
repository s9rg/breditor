//! Actual independently retained files remain locked and checked through the repair.
use super::SealedNativeTailRepairFiles;
use crate::{
    Error, Result, ServerLogGenerationRoomBackupInfo,
    log::{
        MAX_GENERATION_INCOMPLETE_FRAME_BYTES,
        generations::{GenerationFileStamp, GenerationFileWitness},
    },
    server::generation_backup::durable::files,
};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    path::{Path, PathBuf},
};

struct HeldInput {
    path: PathBuf,
    parent: PathBuf,
    file: File,
    witness: GenerationFileWitness,
    stamp: GenerationFileStamp,
}

impl HeldInput {
    fn open(path: &Path, operating_directory: &Path) -> Result<Self> {
        let name = path.file_name().ok_or(Error::Contract("native tail evidence file name"))?;
        let parent = path
            .parent()
            .filter(|value| !value.as_os_str().is_empty())
            .unwrap_or(Path::new("."))
            .canonicalize()?;
        let path = parent.join(name);
        if path.starts_with(operating_directory) {
            return Err(Error::Contract(
                "native tail evidence must be outside the operating directory",
            ));
        }
        let file = files::open(&path)?;
        let witness = GenerationFileWitness::of(&file)?;
        let stamp = GenerationFileStamp::of(&file)?;
        Ok(Self { path, parent, file, witness, stamp })
    }

    fn guard(&self) -> Result<()> {
        self.witness.guard(&self.file, &self.path)?;
        self.stamp.guard(&self.file)
    }

    fn sync(&self) -> Result<()> {
        self.guard()?;
        self.file.sync_all()?;
        File::open(&self.parent)?.sync_all()?;
        self.guard()
    }
}

pub(super) struct RetainedEvidence {
    archive: HeldInput,
    tail: HeldInput,
    pub(super) suffix: Vec<u8>,
}

impl RetainedEvidence {
    pub(super) fn open(
        input: &SealedNativeTailRepairFiles,
        operating_directory: &Path,
    ) -> Result<Self> {
        if !(1..=MAX_GENERATION_INCOMPLETE_FRAME_BYTES).contains(&input.incomplete_bytes) {
            return Err(Error::Contract("native tail evidence byte budget"));
        }
        let operating_directory = operating_directory.canonicalize()?;
        let archive = HeldInput::open(&input.archive, &operating_directory)?;
        let tail = HeldInput::open(&input.suffix, &operating_directory)?;
        let suffix = files::read(&tail.file, &tail.path, input.incomplete_bytes)?;
        if suffix.len() as u64 != input.incomplete_bytes
            || <[u8; 32]>::from(Sha256::digest(&suffix)) != input.incomplete_sha256
        {
            return Err(Error::Contract(
                "native tail evidence differs from the retained suffix pin",
            ));
        }
        Ok(Self { archive, tail, suffix })
    }

    pub(super) fn verify_and_sync(
        &self,
        complete: &ServerLogGenerationRoomBackupInfo,
    ) -> Result<()> {
        self.guard()?;
        if files::digest(&self.archive.file, &self.archive.path, complete.bytes)?
            != complete.identity.archive_sha256
        {
            return Err(Error::Contract(
                "native tail evidence archive differs from the inspected cut",
            ));
        }
        self.archive.sync()?;
        self.tail.sync()?;
        self.guard()
    }

    pub(super) fn guard(&self) -> Result<()> {
        self.archive.guard()?;
        self.tail.guard()
    }
}
