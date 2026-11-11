//! Complete locked source inventory. No upload, cleanup, pruning or manifest normalization.
use super::{
    AssetBackupIdentity, AssetStore, AssetStoreBackup, admission,
    format::{self, Entry, Header, Section},
};
use crate::{
    Error, Result,
    assets::{MAX_ASSETS, record},
};
use std::{collections::BTreeSet, fs, io::Read};

pub(super) fn manifest(store: &AssetStore) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    fs::File::open(store.root.join("store.json"))?.take(4097).read_to_end(&mut bytes)?;
    admission::admit_manifest(&bytes, &store.binding)?;
    Ok(bytes)
}

pub(super) fn files(store: &AssetStore) -> Result<BTreeSet<String>> {
    let mut names = BTreeSet::new();
    for entry in fs::read_dir(&store.root)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            return Err(Error::Contract("asset backup source entry type"));
        }
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| Error::Contract("asset backup source name"))?;
        if !names.insert(name) || names.len() > MAX_ASSETS + 2 {
            return Err(Error::Contract("asset backup source inventory"));
        }
    }
    let expected = store
        .entries
        .keys()
        .map(|id| format!("{}.asset", &id[7..]))
        .chain([".lock".into(), "store.json".into()])
        .collect::<BTreeSet<_>>();
    if names != expected {
        return Err(Error::Contract("asset backup incomplete source inventory"));
    }
    Ok(names)
}
impl AssetStore {
    /// Capture every immutable record and exact original manifest under this store's live lock.
    /// Includes complete unreferenced files; no pending file, cleanup or upload is silently adopted.
    /// # Errors
    /// Rejects poisoned/changed/incomplete storage, original budgets or native raster admission.
    pub fn export_backup(&mut self) -> Result<AssetStoreBackup> {
        self.ready()?;
        super::restore_files::guard_lock(&self.root, &self.lock)?;
        let inventory = files(self)?;
        let manifest = manifest(self)?;
        let mut offset = manifest.len() as u64;
        let mut records = Vec::new();
        let mut entries = Vec::new();
        let mut bytes = 0;
        for info in self.entries.values() {
            let encoded =
                record::read_encoded(&self.root.join(format!("{}.asset", &info.asset[7..])))?;
            let section =
                Section { bytes: encoded.len() as u64, offset, sha256: format::sha(&encoded) };
            offset += section.bytes;
            bytes += info.bytes;
            records.push(admission::admit_record(encoded, info)?);
            entries.push(Entry { info: info.clone(), record: section });
        }
        if bytes != self.bytes || files(self)? != inventory || self::manifest(self)? != manifest {
            return Err(Error::Contract("asset backup live source changed"));
        }
        super::restore_files::guard_lock(&self.root, &self.lock)?;
        let header = Header {
            format: "breditor/relay-asset-backup".into(),
            format_version: 1,
            binding: self.binding.clone(),
            bytes,
            manifest: Section {
                bytes: manifest.len() as u64,
                offset: 0,
                sha256: format::sha(&manifest),
            },
            records: entries,
        };
        let mut backup = AssetStoreBackup {
            header,
            manifest,
            records,
            identity: AssetBackupIdentity {
                binding: self.binding.clone(),
                assets: self.entries.len() as u64,
                bytes,
                archive_sha256: [0; 32],
            },
        };
        let mut digest =
            crate::archive_digest::ArchiveDigest::new(format::MAX_SERVER_ASSET_BACKUP_BYTES);
        backup.write_to(&mut digest)?;
        backup.identity.archive_sha256 = digest.finish().0;
        Ok(backup)
    }
}
