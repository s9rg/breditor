//! Hold exact retained evidence outside the original sealed operating directory.
use crate::{
    Error, Result,
    log::generations::{GenerationFileStamp, GenerationFileWitness},
    server::generation_backup::durable::files,
};
use std::{
    fs::File,
    path::{Path, PathBuf},
};

pub(super) struct RetainedRepairFile {
    path: PathBuf,
    parent: PathBuf,
    file: File,
    witness: GenerationFileWitness,
    stamp: GenerationFileStamp,
}

impl RetainedRepairFile {
    pub(super) fn open(
        path: &Path,
        operating_directory: &Path,
        outside_error: &'static str,
    ) -> Result<Self> {
        let name = path.file_name().ok_or(Error::Contract("sealed repair evidence file name"))?;
        let parent = path
            .parent()
            .filter(|value| !value.as_os_str().is_empty())
            .unwrap_or(Path::new("."))
            .canonicalize()?;
        let path = parent.join(name);
        if path.starts_with(operating_directory) {
            return Err(Error::Contract(outside_error));
        }
        let file = files::open(&path)?;
        let witness = GenerationFileWitness::of(&file)?;
        let stamp = GenerationFileStamp::of(&file)?;
        Ok(Self { path, parent, file, witness, stamp })
    }

    pub(super) fn guard(&self) -> Result<()> {
        self.witness.guard(&self.file, &self.path)?;
        self.stamp.guard(&self.file)
    }

    pub(super) fn sync(&self) -> Result<()> {
        self.guard()?;
        self.file.sync_all()?;
        File::open(&self.parent)?.sync_all()?;
        self.guard()
    }
    pub(super) fn read(&self, limit: u64) -> Result<Vec<u8>> {
        files::read(&self.file, &self.path, limit)
    }

    pub(super) fn digest(&self, length: u64) -> Result<[u8; 32]> {
        files::digest(&self.file, &self.path, length)
    }
}
