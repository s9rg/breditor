//! Actual raster directory/root/lock custody. Never replace an owned component with matching bytes.
use super::{files, selection::RasterWitness};
use crate::{Error, Result, assets::AssetStore, log::generations::GenerationFileWitness};
use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
};

pub(super) struct RasterDirectory {
    pub path: PathBuf,
    root: File,
    lock: File,
    witness: RasterWitness,
}
pub(super) struct RasterCustody {
    path: PathBuf,
    root: File,
    witness: RasterWitness,
}
fn root_identity(file: &File) -> Result<(u64, u64)> {
    let metadata = file.metadata()?;
    if !metadata.is_dir() {
        return Err(Error::Contract("joined raster root type"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.mode() & 0o077 != 0 {
            return Err(Error::Contract("joined raster root privacy"));
        }
        Ok((metadata.dev(), metadata.ino()))
    }
    #[cfg(not(unix))]
    {
        Err(Error::Contract("joined recovery requires Unix custody"))
    }
}
fn guard_root(path: &Path, file: &File, witness: &RasterWitness) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_dir() || root_identity(file)? != (witness.device, witness.inode) {
        return Err(Error::Contract("joined raster root custody differs"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.mode() & 0o077 != 0
            || (metadata.dev(), metadata.ino()) != (witness.device, witness.inode)
        {
            return Err(Error::Contract("joined raster named root differs"));
        }
    }
    Ok(())
}
impl RasterDirectory {
    pub fn create(path: &Path) -> Result<Self> {
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(path)?;
        let root = File::open(path)?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let lock = options.open(path.join(".lock"))?;
        lock.try_lock().map_err(|e| match e {
            fs::TryLockError::WouldBlock => Error::Locked,
            fs::TryLockError::Error(e) => Error::Io(e),
        })?;
        lock.sync_all()?;
        root.sync_all()?;
        File::open(path.parent().ok_or(Error::Contract("joined raster parent"))?)?.sync_all()?;
        let (device, inode) = root_identity(&root)?;
        let witness = RasterWitness { device, inode, lock: GenerationFileWitness::of(&lock)? };
        let value = Self { path: path.to_owned(), root, lock, witness };
        value.guard()?;
        Ok(value)
    }
    pub fn open(path: &Path, expected: &RasterWitness) -> Result<Self> {
        if !fs::symlink_metadata(path)?.is_dir() {
            return Err(Error::Contract("joined raster directory type"));
        }
        let root = File::open(path)?;
        guard_root(path, &root, expected)?;
        let lock = files::open(&path.join(".lock"))?;
        let value = Self { path: path.to_owned(), root, lock, witness: expected.clone() };
        value.guard()?;
        Ok(value)
    }
    pub fn witness(&self) -> Result<RasterWitness> {
        self.guard()?;
        Ok(self.witness.clone())
    }
    pub fn guard(&self) -> Result<()> {
        guard_root(&self.path, &self.root, &self.witness)?;
        self.witness.lock.guard(&self.lock, &self.path.join(".lock"))?;
        if self.lock.metadata()?.len() != 0 {
            return Err(Error::Contract("joined raster lock changed"));
        }
        Ok(())
    }
    pub fn sync(&self) -> Result<()> {
        self.root.sync_all().map_err(Into::into)
    }
    pub fn into_store(self, binding: &str) -> Result<(AssetStore, RasterCustody)> {
        self.into_store_with(binding, AssetStore::open_recovered_with_lock)
    }
    #[cfg(feature = "server")]
    pub fn into_store_for_upload_inspection(
        self,
        binding: &str,
    ) -> Result<(AssetStore, RasterCustody)> {
        self.into_store_with(binding, AssetStore::open_recovered_for_upload_inspection)
    }
    fn into_store_with(
        self,
        binding: &str,
        load: fn(PathBuf, File, &str) -> Result<AssetStore>,
    ) -> Result<(AssetStore, RasterCustody)> {
        self.guard()?;
        let Self { path, root, lock, witness } = self;
        let assets = load(path.clone(), lock, binding)?;
        let custody = RasterCustody { path, root, witness };
        custody.guard(&assets)?;
        Ok((assets, custody))
    }
}
impl RasterCustody {
    pub fn guard_file(&self, name: &str, expected: &GenerationFileWitness) -> Result<()> {
        let path = self.path.join(name);
        let file = File::open(&path)?;
        expected.guard(&file, &path)
    }
    pub fn guard_selected(&self, expected: &RasterWitness, assets: &AssetStore) -> Result<()> {
        if &self.witness != expected {
            return Err(Error::Contract("joined raster selected custody differs"));
        }
        self.guard(assets)
    }
    pub fn guard(&self, assets: &AssetStore) -> Result<()> {
        guard_root(&self.path, &self.root, &self.witness)?;
        assets.guard_recovered_lock(&self.path, &self.witness.lock)
    }
}
