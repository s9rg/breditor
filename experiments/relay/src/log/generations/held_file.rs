//! Held inode custody. A matching content hash cannot replace the actually locked source.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs::{File, Metadata},
    io::{Read, Seek, SeekFrom},
    path::Path,
};

/// Ephemeral change witness, not a portable identity or a substitute for replay hashes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct FileStamp {
    modified: (i64, i64),
    changed: (i64, i64),
}
impl FileStamp {
    pub(crate) fn of(file: &File) -> Result<Self> {
        let metadata = file.metadata()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            Ok(Self {
                modified: (metadata.mtime(), metadata.mtime_nsec()),
                changed: (metadata.ctime(), metadata.ctime_nsec()),
            })
        }
        #[cfg(not(unix))]
        {
            let _ = metadata;
            Err(Error::Contract("log generations require Unix change witnesses"))
        }
    }
    pub(crate) fn guard(self, file: &File) -> Result<()> {
        if Self::of(file)? != self {
            return Err(Error::Contract("held log storage changed in place"));
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct FileIdentity {
    device: u64,
    inode: u64,
}
impl FileIdentity {
    pub(crate) fn of(file: &File) -> Result<Self> {
        Self::metadata(&file.metadata()?)
    }
    fn metadata(metadata: &Metadata) -> Result<Self> {
        if !metadata.is_file() {
            return Err(Error::Contract("log custody requires a regular inode"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if metadata.mode() & 0o077 != 0 {
                return Err(Error::Contract("physical log file is not private"));
            }
            Ok(Self { device: metadata.dev(), inode: metadata.ino() })
        }
        #[cfg(not(unix))]
        {
            let _ = metadata;
            Err(Error::Contract("log generations require Unix inode custody"))
        }
    }
    pub(crate) fn guard(&self, file: &File, path: &Path) -> Result<()> {
        let named = std::fs::symlink_metadata(path)?;
        if !named.is_file() || Self::of(file)? != *self || Self::metadata(&named)? != *self {
            return Err(Error::Contract("log generation file custody differs"));
        }
        Ok(())
    }
}
pub(super) fn open(path: &Path) -> Result<File> {
    if !std::fs::symlink_metadata(path)?.is_file() {
        return Err(Error::Contract("log generation file type"));
    }
    let file = super::super::options().open(path)?;
    super::super::lock(&file)?;
    FileIdentity::of(&file)?.guard(&file, path)?;
    Ok(file)
}
pub(super) fn read(file: &File, budget: u64) -> Result<Vec<u8>> {
    let length = file.metadata()?.len();
    if length > budget {
        return Err(Error::Contract("log generation file byte budget"));
    }
    let mut reader = file.try_clone()?;
    reader.seek(SeekFrom::Start(0))?;
    let mut bytes = vec![0; usize::try_from(length).map_err(|_| Error::Contract("log byte size"))?];
    reader.read_exact(&mut bytes)?;
    if reader.metadata()?.len() != length {
        return Err(Error::Contract("log generation file changed while reading"));
    }
    Ok(bytes)
}
