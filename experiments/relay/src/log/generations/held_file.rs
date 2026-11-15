//! Held inode custody. A matching content hash cannot replace the actually locked source.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
#[cfg(not(unix))]
use std::io::{Read, Seek, SeekFrom};
#[cfg(unix)]
use std::os::unix::fs::FileExt;
use std::{
    fs::{File, Metadata},
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
    pub(super) fn same_device(self, other: Self) -> bool {
        self.device == other.device
    }

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
    let mut bytes = vec![0; usize::try_from(length).map_err(|_| Error::Contract("log byte size"))?];
    // Clones share a cursor. Independent custody checks must read from their own offset.
    #[cfg(unix)]
    file.read_exact_at(&mut bytes, 0)?;
    #[cfg(not(unix))]
    {
        let mut reader = file.try_clone()?;
        reader.seek(SeekFrom::Start(0))?;
        reader.read_exact(&mut bytes)?;
    }
    if file.metadata()?.len() != length {
        return Err(Error::Contract("log generation file changed while reading"));
    }
    Ok(bytes)
}

#[cfg(all(test, unix))]
mod tests {
    use super::read;
    use crate::log::framing_tests::Files;
    use std::io::{Seek, SeekFrom, Write};

    #[test]
    fn custody_read_leaves_the_shared_descriptor_position_unchanged()
    -> Result<(), Box<dyn std::error::Error>> {
        let files = Files::new()?;
        let mut file = crate::log::options().create_new(true).open(files.log())?;
        let contents = b"BREDITOR-LOG-GENERATIONS1\nfixture\n";
        file.write_all(contents)?;
        let mut observation = file.try_clone()?;
        observation.seek(SeekFrom::Start(7))?;
        assert_eq!(read(&file, 256)?, contents);
        assert_eq!(observation.stream_position()?, 7);
        Ok(())
    }
}
