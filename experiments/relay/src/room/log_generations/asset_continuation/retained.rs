//! Admit ordered, byte-exact raster archives through one held pack descriptor.
use super::{
    ARCHIVE,
    archive::AssetArchive,
    lineage::{Lineage, MAX_RETAINED_ARCHIVE_BYTES},
};
use crate::{
    Error, Result,
    archive_input::ArchiveInput,
    assets::StoredAsset,
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{self, Write},
    path::Path,
};

pub(super) struct RetainedArchives {
    input: ArchiveInput,
    archives: Vec<AssetArchive>,
    by_digest: BTreeMap<String, usize>,
}

impl RetainedArchives {
    pub(super) fn admit(file: File, lineage: &Lineage) -> Result<Self> {
        lineage.validate()?;
        let input = ArchiveInput::new(file, MAX_RETAINED_ARCHIVE_BYTES)?;
        let sections = lineage.sections(input.all().len())?;
        let mut offset = 0;
        let mut archives = Vec::with_capacity(sections.len());
        let mut by_digest = BTreeMap::new();
        for (index, (identity, bytes)) in sections.into_iter().enumerate() {
            let archive =
                AssetArchive::admit_input(input.retained_section(offset, bytes)?, identity)?;
            for digest in archive.keys() {
                if by_digest.insert(digest.to_owned(), index).is_some() {
                    return Err(Error::Contract("retained raster generations overlap"));
                }
            }
            archives.push(archive);
            offset += bytes;
        }
        input.check()?;
        Ok(Self { input, archives, by_digest })
    }

    pub(super) fn open(
        path: &Path,
        witness: &GenerationFileWitness,
        lineage: &Lineage,
    ) -> Result<Self> {
        if !fs::symlink_metadata(path)?.is_file() {
            return Err(Error::Contract("retained raster archive file type"));
        }
        let file = File::open(path)?;
        witness.guard(&file, path)?;
        let retained = Self::admit(file, lineage)?;
        retained.guard(path, witness)?;
        Ok(retained)
    }

    pub(super) fn copy_into(
        &self,
        directory: &GenerationDirectory,
        lineage: &Lineage,
        append: Option<&AssetArchive>,
    ) -> Result<(Self, GenerationFileWitness)> {
        let mut file = directory.create_file(ARCHIVE, &[])?;
        self.write_to(&mut file)?;
        if let Some(append) = append {
            append.write_to(&mut file)?;
        }
        file.sync_all()?;
        let witness = GenerationFileWitness::of(&file)?;
        let retained = Self::admit(file, lineage)?;
        retained.guard(&directory.path.join(ARCHIVE), &witness)?;
        directory.sync()?;
        directory.guard()?;
        Ok((retained, witness))
    }

    pub(super) fn write_to(&self, output: &mut impl Write) -> Result<()> {
        self.input.check()?;
        let bytes = self.input.all();
        if io::copy(&mut bytes.reader(), output)? != bytes.len() {
            return Err(Error::Contract("retained raster pack copy length differs"));
        }
        self.input.check()
    }

    pub(super) fn root_archive_bytes(&self) -> u64 {
        self.archives[0].bytes()
    }

    pub(super) fn keys(&self) -> impl Iterator<Item = &str> {
        self.by_digest.keys().map(String::as_str)
    }

    pub(super) fn contains(&self, digest: &str) -> bool {
        self.by_digest.contains_key(digest)
    }

    pub(super) fn get(&self, asset: &str, digest: &str) -> Result<Option<StoredAsset>> {
        match self.by_digest.get(digest) {
            Some(index) => self.archives[*index].get(asset, digest),
            None => Ok(None),
        }
    }

    #[cfg(feature = "server")]
    pub(super) fn check(&self) -> Result<()> {
        self.input.check()
    }

    pub(super) fn guard(&self, path: &Path, witness: &GenerationFileWitness) -> Result<()> {
        self.input.check_named(witness, path)
    }
}
