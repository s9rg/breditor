//! Exact new joined-capture source check without allocating a second complete raster archive.
use super::{AssetStore, AssetStoreBackup, restore_files};
use crate::{
    Error, Result,
    log::generations::{GenerationFileStamp, GenerationFileWitness},
};
use std::{
    collections::BTreeSet,
    fs::{self, File},
    io::Read,
};
fn names(store: &AssetStore) -> Result<BTreeSet<String>> {
    let mut names = BTreeSet::new();
    for entry in fs::read_dir(&store.root)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() || names.len() >= crate::assets::MAX_ASSETS + 2 {
            return Err(Error::Contract("joined asset source type or count"));
        }
        names.insert(
            entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("joined asset source name"))?,
        );
    }
    Ok(names)
}
impl AssetStore {
    pub(crate) fn check_exported_backup(&self, backup: &AssetStoreBackup) -> Result<()> {
        self.ready()?;
        restore_files::guard_lock(&self.root, &self.lock)?;
        if self.binding != backup.identity.binding
            || self.bytes != backup.identity.bytes
            || self.entries.len() != backup.records.len()
        {
            return Err(Error::Contract("joined asset source selection differs"));
        }
        let selected = backup.selected_files();
        let expected = selected
            .keys()
            .cloned()
            .chain(std::iter::once(".lock".into()))
            .collect::<BTreeSet<_>>();
        if names(self)? != expected {
            return Err(Error::Contract("joined asset source inventory differs"));
        }
        let mut witnesses = Vec::new();
        for (name, bytes) in selected {
            let path = self.root.join(&name);
            let mut file = File::open(&path)?;
            let identity = GenerationFileWitness::of(&file)?;
            let stamp = GenerationFileStamp::of(&file)?;
            identity.guard(&file, &path)?;
            if file.metadata()?.len() != bytes.len() as u64 {
                return Err(Error::Contract("joined asset source length differs"));
            }
            let mut buffer = [0_u8; 8192];
            for block in bytes.chunks(buffer.len()) {
                file.read_exact(&mut buffer[..block.len()])?;
                if &buffer[..block.len()] != block {
                    return Err(Error::Contract("joined asset source bytes differ"));
                }
            }
            identity.guard(&file, &path)?;
            stamp.guard(&file)?;
            witnesses.push((path, identity, stamp, bytes.len() as u64));
        }
        for (path, identity, stamp, length) in witnesses {
            let file = File::open(&path)?;
            identity.guard(&file, &path)?;
            stamp.guard(&file)?;
            if file.metadata()?.len() != length {
                return Err(Error::Contract("joined asset source changed during read"));
            }
        }
        if names(self)? != expected {
            return Err(Error::Contract("joined asset source inventory changed"));
        }
        restore_files::guard_lock(&self.root, &self.lock)
    }
}
