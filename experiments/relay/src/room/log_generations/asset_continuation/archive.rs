//! One independently selected original asset archive with bounded, verified record reads.
use crate::{
    Error, Result,
    archive_input::{ArchiveEntry, ArchiveInput},
    assets::{
        AssetBackupIdentity, MAX_SERVER_ASSET_BACKUP_BYTES, StoredAsset, admit_asset_file,
        decode_raster_record,
    },
    log::generations::{GenerationDirectory, GenerationFileWitness},
};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::Path,
};

pub(super) struct AssetArchive {
    input: ArchiveInput,
    files: BTreeMap<String, ArchiveEntry>,
    pub(super) identity: AssetBackupIdentity,
}

impl AssetArchive {
    pub(super) fn admit(file: File, expected: &AssetBackupIdentity) -> Result<Self> {
        let input = ArchiveInput::new(file, MAX_SERVER_ASSET_BACKUP_BYTES)?;
        let files = admit_asset_file(input.all(), expected)?;
        input.check()?;
        Ok(Self { input, files, identity: expected.clone() })
    }

    pub(super) fn open(
        path: &Path,
        witness: &GenerationFileWitness,
        expected: &AssetBackupIdentity,
    ) -> Result<Self> {
        if !fs::symlink_metadata(path)?.is_file() {
            return Err(Error::Contract("retained raster archive file type"));
        }
        let file = File::open(path)?;
        witness.guard(&file, path)?;
        let result = Self::admit(file, expected)?;
        result.guard(path, witness)?;
        Ok(result)
    }

    pub(super) fn copy_into(
        &self,
        directory: &GenerationDirectory,
        name: &str,
    ) -> Result<(Self, GenerationFileWitness)> {
        let mut file = directory.create_file(name, &[])?;
        self.write_to(&mut file)?;
        file.sync_all()?;
        let path = directory.path.join(name);
        let witness = GenerationFileWitness::of(&file)?;
        let input = ArchiveInput::new(file, MAX_SERVER_ASSET_BACKUP_BYTES)?;
        if input.all().digest()? != self.identity.archive_sha256 {
            return Err(Error::Contract("copied raster archive differs"));
        }
        input.check_named(&witness, &path)?;
        directory.guard()?;
        let archived = Self { input, files: self.files.clone(), identity: self.identity.clone() };
        Ok((archived, witness))
    }

    pub(super) fn guard(&self, path: &Path, witness: &GenerationFileWitness) -> Result<()> {
        self.input.check_named(witness, path)
    }

    #[cfg(feature = "server")]
    pub(super) fn check(&self) -> Result<()> {
        self.input.check()
    }

    pub(super) fn write_to(&self, output: &mut impl Write) -> Result<()> {
        self.input.check()?;
        let bytes = self.input.all();
        if io::copy(&mut bytes.reader(), output)? != bytes.len() {
            return Err(Error::Contract("raster archive copy length differs"));
        }
        self.input.check()
    }

    pub(super) fn keys(&self) -> impl Iterator<Item = &str> {
        self.files.keys().filter_map(|name| name.strip_suffix(".asset"))
    }

    pub(super) fn get(&self, asset: &str, digest: &str) -> Result<Option<StoredAsset>> {
        self.files
            .get(&format!("{digest}.asset"))
            .map(|entry| decode_raster_record(&self.record(entry)?, asset))
            .transpose()
    }

    fn record(&self, entry: &ArchiveEntry) -> Result<Vec<u8>> {
        let encoded =
            self.input.all().section(entry.offset, entry.bytes)?.read(entry.bytes)?.into_owned();
        if <[u8; 32]>::from(Sha256::digest(&encoded)) != entry.sha256 {
            return Err(Error::Contract("retained raster record digest differs"));
        }
        self.input.check()?;
        Ok(encoded)
    }

    /// A fresh live directory inherits all exact ordinary files from its selected active archive.
    pub(super) fn install(&self, path: &Path) -> Result<()> {
        for (name, entry) in &self.files {
            let encoded = self.record(entry)?;
            let mut options = OpenOptions::new();
            options.create_new(true).read(true).write(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let destination = path.join(name);
            let mut output = options.open(&destination)?;
            output.write_all(&encoded)?;
            output.sync_all()?;
            let witness = GenerationFileWitness::of(&output)?;
            let input = ArchiveInput::new(output, entry.bytes)?;
            if input.all().len() != entry.bytes || input.all().digest()? != entry.sha256 {
                return Err(Error::Contract("restored active raster record differs"));
            }
            input.check_named(&witness, &destination)?;
        }
        self.input.check()
    }
}
