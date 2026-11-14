//! Keep a bounded section table and verify one original raster record at a time.
use super::{AssetBackupIdentity, AssetStore, admission, export, format, restore_files};
use crate::{
    Error, Result,
    archive_digest::ArchiveDigest,
    archive_input::ArchiveEntry,
    assets::{MAX_ASSET_BYTES, record},
    log::generations::{GenerationFileStamp, GenerationFileWitness},
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_RECORD_BYTES: u64 = record::HEADER + record::MAX_METADATA as u64 + MAX_ASSET_BYTES;

struct RecordFile {
    path: PathBuf,
    identity: GenerationFileWitness,
    stamp: GenerationFileStamp,
    length: u64,
}

impl RecordFile {
    fn open(&self) -> Result<File> {
        if !fs::symlink_metadata(&self.path)?.is_file() {
            return Err(Error::Contract("streamed asset file type"));
        }
        let file = File::open(&self.path)?;
        self.check(&file)?;
        Ok(file)
    }

    fn check(&self, file: &File) -> Result<()> {
        self.identity.guard(file, &self.path)?;
        self.stamp.guard(file)?;
        if file.metadata()?.len() != self.length {
            return Err(Error::Contract("streamed asset file length changed"));
        }
        Ok(())
    }

    fn read(&self, file: &mut File) -> Result<Vec<u8>> {
        let mut bytes = Vec::new();
        file.take(self.length + 1).read_to_end(&mut bytes)?;
        self.check(file)?;
        if bytes.len() as u64 != self.length {
            return Err(Error::Contract("streamed asset file bytes changed"));
        }
        Ok(bytes)
    }
}

pub(crate) struct AssetBackupStream<'a> {
    store: &'a AssetStore,
    inventory: BTreeSet<String>,
    manifest: Vec<u8>,
    records: Vec<RecordFile>,
    header: format::Header,
    pub(crate) bytes: u64,
    pub(crate) identity: AssetBackupIdentity,
}

fn capture_record(path: &Path, info: &crate::assets::AssetInfo) -> Result<(RecordFile, [u8; 32])> {
    let named = fs::symlink_metadata(path)?;
    if !named.is_file() || named.len() > MAX_RECORD_BYTES {
        return Err(Error::Contract("streamed asset file bounds"));
    }
    let mut file = File::open(path)?;
    let source = RecordFile {
        path: path.to_owned(),
        identity: GenerationFileWitness::of(&file)?,
        stamp: GenerationFileStamp::of(&file)?,
        length: named.len(),
    };
    source.check(&file)?;
    let bytes = source.read(&mut file)?;
    let hash = format::sha(&bytes);
    admission::admit_record(bytes, info)?;
    Ok((source, hash))
}

impl AssetStore {
    pub(crate) fn prepare_backup_stream(&self) -> Result<AssetBackupStream<'_>> {
        self.ready()?;
        restore_files::guard_lock(&self.root, &self.lock)?;
        let inventory = export::files(self)?;
        let manifest = export::manifest(self)?;
        let mut offset = manifest.len() as u64;
        let mut bytes = 0;
        let mut records = Vec::with_capacity(self.entries.len());
        let mut entries = Vec::with_capacity(self.entries.len());
        for info in self.entries.values() {
            let path = self.root.join(format!("{}.asset", &info.asset[7..]));
            let (file, sha256) = capture_record(&path, info)?;
            let section = format::Section { offset, bytes: file.length, sha256 };
            offset += section.bytes;
            bytes += info.bytes;
            records.push(file);
            entries.push(format::Entry { info: info.clone(), record: section });
        }
        if bytes != self.bytes {
            return Err(Error::Contract("streamed asset payload count differs"));
        }
        let header = format::Header {
            format: "breditor/relay-asset-backup".into(),
            format_version: 1,
            binding: self.binding.clone(),
            bytes,
            manifest: format::Section {
                offset: 0,
                bytes: manifest.len() as u64,
                sha256: format::sha(&manifest),
            },
            records: entries,
        };
        let mut stream = AssetBackupStream {
            store: self,
            inventory,
            manifest,
            records,
            header,
            bytes: 0,
            identity: AssetBackupIdentity {
                binding: self.binding.clone(),
                assets: self.entries.len() as u64,
                bytes,
                archive_sha256: [0; 32],
            },
        };
        let mut hash = ArchiveDigest::new(format::MAX_SERVER_ASSET_BACKUP_BYTES);
        stream.write_to(&mut hash)?;
        (stream.identity.archive_sha256, stream.bytes) = hash.finish();
        Ok(stream)
    }
}

impl AssetBackupStream<'_> {
    pub(crate) fn check_retains(
        &self,
        identity: &AssetBackupIdentity,
        originals: &BTreeMap<String, ArchiveEntry>,
    ) -> Result<()> {
        if self.identity.binding != identity.binding {
            return Err(Error::Contract("operational asset manifest differs"));
        }
        let records = std::iter::once(("store.json".to_owned(), &self.header.manifest))
            .chain(self.header.records.iter().map(|entry| {
                (super::selected_files::record_name(&entry.info.asset), &entry.record)
            }))
            .collect::<BTreeMap<_, _>>();
        for (name, original) in originals {
            let current =
                records.get(name).ok_or(Error::Contract("operational original asset absent"))?;
            if original.bytes != current.bytes || original.sha256 != current.sha256 {
                return Err(Error::Contract("operational original asset differs"));
            }
        }
        self.check()
    }

    pub(crate) fn check(&self) -> Result<()> {
        self.store.ready()?;
        restore_files::guard_lock(&self.store.root, &self.store.lock)?;
        if export::files(self.store)? != self.inventory
            || export::manifest(self.store)? != self.manifest
        {
            return Err(Error::Contract("streamed asset source changed"));
        }
        for source in &self.records {
            source.open()?;
        }
        restore_files::guard_lock(&self.store.root, &self.store.lock)
    }

    pub(crate) fn write_to(&self, output: &mut impl Write) -> Result<()> {
        let header = serde_json::to_vec(&self.header)?;
        output.write_all(&format::prefix(&header)?)?;
        output.write_all(&header)?;
        output.write_all(&self.manifest)?;
        for (source, entry) in self.records.iter().zip(&self.header.records) {
            let bytes = source.read(&mut source.open()?)?;
            if format::sha(&bytes) != entry.record.sha256 {
                return Err(Error::Contract("streamed raster record changed"));
            }
            output.write_all(&bytes)?;
        }
        self.check()
    }
}
