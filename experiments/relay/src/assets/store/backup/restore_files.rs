//! Prefix-checked append and absent-only hard links. Unknown or divergent bytes are never repaired.
use super::{private_options, sync_directory};
use crate::{Error, Result};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};

pub(in crate::assets::store) fn guard_lock(root: &Path, held: &File) -> Result<()> {
    let path = fs::symlink_metadata(root.join(".lock"))?;
    if !path.is_file() {
        return Err(Error::Contract("asset store lock source"));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let owner = held.metadata()?;
        if owner.dev() != path.dev() || owner.ino() != path.ino() {
            return Err(Error::Contract("asset store lock source"));
        }
    }
    #[cfg(not(unix))]
    {
        let _ = held.metadata()?;
    }
    Ok(())
}

pub(super) fn read(path: &Path, max: usize) -> Result<Vec<u8>> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.len() > max as u64 {
        return Err(Error::Contract("asset restore file type/bytes"));
    }
    let mut bytes = Vec::new();
    File::open(path)?.take(max as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > max {
        return Err(Error::Contract("asset restore file bytes"));
    }
    Ok(bytes)
}
pub(super) fn exists(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.into()),
    }
}
pub(super) fn exact(path: &Path, expected: &[u8]) -> Result<()> {
    if read(path, expected.len())? != expected {
        return Err(Error::Contract("asset restore divergent bytes"));
    }
    Ok(())
}
pub(super) fn durable_exact(path: &Path, expected: &[u8]) -> Result<()> {
    exact(path, expected)?;
    File::open(path)?.sync_all()?;
    Ok(())
}
pub(super) fn prefix(path: &Path, expected: &[u8]) -> Result<()> {
    let bytes = read(path, expected.len())?;
    if !expected.starts_with(&bytes) {
        return Err(Error::Contract("asset restore divergent staging"));
    }
    Ok(())
}
pub(super) fn publish(
    root: &Path,
    stage_name: &str,
    final_name: &str,
    expected: &[u8],
) -> Result<()> {
    let stage = root.join(stage_name);
    let destination = root.join(final_name);
    let published = exists(&destination)?;
    if published {
        durable_exact(&destination, expected)?;
        if !exists(&stage)? {
            return Ok(());
        }
    }
    let mut file = if exists(&stage)? {
        prefix(&stage, expected)?;
        OpenOptions::new().append(true).open(&stage)?
    } else {
        private_options().create_new(true).open(&stage)?
    };
    let length = usize::try_from(file.metadata()?.len())
        .map_err(|_| Error::Contract("asset restore staging bytes"))?;
    let remaining = expected.get(length..).ok_or(Error::Contract("asset restore staging bytes"))?;
    file.write_all(remaining)?;
    file.sync_all()?;
    drop(file);
    exact(&stage, expected)?;
    match fs::hard_link(&stage, &destination) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => exact(&destination, expected)?,
        Err(e) => return Err(e.into()),
    }
    sync_directory(root)?;
    Ok(())
}
