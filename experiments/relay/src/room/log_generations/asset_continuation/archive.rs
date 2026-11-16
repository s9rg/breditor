//! One independently selected original asset archive with bounded, verified record reads.
use crate::{
    Error, Result,
    archive_input::{ArchiveEntry, ArchiveInput},
    assets::{
        AssetBackupIdentity, MAX_SERVER_ASSET_BACKUP_BYTES, StoredAsset, admit_asset_file,
        decode_raster_record,
    },
    log::generations::GenerationFileWitness,
};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{File, OpenOptions},
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
        Self::admit_input(input, expected)
    }

    pub(super) fn admit_input(input: ArchiveInput, expected: &AssetBackupIdentity) -> Result<Self> {
        let files = admit_asset_file(input.all(), expected)?;
        input.check()?;
        Ok(Self { input, files, identity: expected.clone() })
    }

    pub(super) fn bytes(&self) -> u64 {
        self.input.all().len()
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

    #[cfg(feature = "server")]
    pub(super) fn entries(&self) -> &BTreeMap<String, ArchiveEntry> {
        &self.files
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
