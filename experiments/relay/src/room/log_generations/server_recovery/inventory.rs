//! Closed bounded inactive namespace. Unknown work is preserved and refused, never scavenged.
use super::{ServerLogGenerationRoomRecovery, files, raster_directory::RasterDirectory};
use crate::{Error, Result, credentials, log::generations::GenerationFileWitness};
use std::{collections::BTreeSet, fs, path::Path};
fn orphan_directory(path: &Path, native: bool) -> Result<u64> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_dir() {
        return Err(Error::Contract("joined unselected component type"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if metadata.mode() & 0o077 != 0 {
            return Err(Error::Contract("joined unselected component privacy"));
        }
    }
    let mut total = 0;
    let mut count = 0;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        count += 1;
        let name = entry.file_name();
        let metadata = fs::symlink_metadata(entry.path())?;
        let allowed =
            if native { name == ".owner" || name == ".recovery.json" } else { name == ".lock" };
        if !allowed
            || count > 2
            || !metadata.is_file()
            || metadata.len() > files::MAX_CONTROL
            || !native && metadata.len() != 0
        {
            return Err(Error::Contract("joined unselected component has unknown work"));
        }
        let file = fs::File::open(entry.path())?;
        GenerationFileWitness::of(&file)?.guard(&file, &entry.path())?;
        total += metadata.len();
    }
    Ok(total)
}
impl ServerLogGenerationRoomRecovery {
    pub(super) fn outer_inventory(
        &self,
        known: &BTreeSet<String>,
        components: &BTreeSet<String>,
    ) -> Result<()> {
        self.outer_names(known, components).map(drop)
    }
    pub(super) fn outer_names(
        &self,
        known: &BTreeSet<String>,
        components: &BTreeSet<String>,
    ) -> Result<BTreeSet<String>> {
        let mut count = 0;
        let mut orphans = 0;
        let mut bytes = 0;
        let mut names = BTreeSet::new();
        for entry in fs::read_dir(&self.directory.path)? {
            let entry = entry?;
            count += 1;
            if count > crate::assets::MAX_ASSETS * 2 + 256 {
                return Err(Error::Contract("joined recovery entry budget"));
            }
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("joined recovery filename"))?;
            names.insert(name.clone());
            if components.contains(&name) {
                if !fs::symlink_metadata(entry.path())?.is_dir() {
                    return Err(Error::Contract("joined selected component type"));
                }
                continue;
            }
            if let Some(nonce) =
                name.strip_prefix(".native-").or_else(|| name.strip_prefix(".rasters-"))
            {
                credentials::hash(nonce)?;
                bytes += orphan_directory(&entry.path(), name.starts_with(".native-"))?;
                orphans += 1;
                continue;
            }
            let metadata = fs::symlink_metadata(entry.path())?;
            if !metadata.is_file() {
                return Err(Error::Contract("joined recovery file type"));
            }
            let file = fs::File::open(entry.path())?;
            GenerationFileWitness::of(&file)?.guard(&file, &entry.path())?;
            if known.contains(&name) {
                continue;
            }
            if let Some(nonce) = name.strip_prefix(".raster-data-") {
                credentials::hash(nonce)?;
                if metadata.len() != 0 {
                    return Err(Error::Contract("joined unselected data is not empty"));
                }
            } else if let Some(nonce) = name.strip_prefix(".meta-") {
                credentials::hash(nonce)?;
                if metadata.len() > files::MAX_CONTROL {
                    return Err(Error::Contract("joined unselected metadata budget"));
                }
            } else {
                return Err(Error::Contract("joined recovery has unknown work"));
            }
            orphans += 1;
            bytes += metadata.len();
        }
        if orphans > 64 || bytes > files::MAX_CONTROL * 64 {
            return Err(Error::Contract("joined recovery orphan budget"));
        }
        self.directory.guard()?;
        Ok(names)
    }
    pub(super) fn raster_inventory(
        directory: &RasterDirectory,
        selected: &BTreeSet<String>,
    ) -> Result<()> {
        let mut count = 0;
        for entry in fs::read_dir(&directory.path)? {
            let entry = entry?;
            count += 1;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| Error::Contract("joined raster filename"))?;
            if count > crate::assets::MAX_ASSETS + 2
                || !selected.contains(&name)
                || !fs::symlink_metadata(entry.path())?.is_file()
            {
                return Err(Error::Contract("joined raster has unknown work"));
            }
        }
        directory.guard()
    }
}
