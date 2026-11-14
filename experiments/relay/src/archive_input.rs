//! Bounded, independent reads from archive bytes or a held archive inode.
use crate::{Error, Result, archive_digest::ArchiveDigest, log::generations::GenerationFileStamp};
use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use std::{
    borrow::Cow,
    fs::File,
    io::{self, Read},
};

pub(crate) struct ArchiveInput {
    file: File,
    stamp: GenerationFileStamp,
    bytes: u64,
}

#[derive(Clone, Copy)]
pub(crate) struct ArchiveRange<'a> {
    input: &'a ArchiveInput,
    offset: u64,
    bytes: u64,
}

#[derive(Clone, Copy)]
pub(crate) enum ArchiveSlice<'a> {
    Bytes(&'a [u8]),
    File(ArchiveRange<'a>),
}

pub(crate) struct ArchiveEntry {
    pub(crate) offset: u64,
    pub(crate) bytes: u64,
    pub(crate) sha256: [u8; 32],
}

impl ArchiveInput {
    pub(crate) fn new(file: File, limit: u64) -> Result<Self> {
        let stamp = GenerationFileStamp::of(&file)?;
        let metadata = file.metadata()?;
        if !metadata.is_file() || metadata.len() > limit {
            return Err(Error::Contract("backup input file type or size"));
        }
        stamp.guard(&file)?;
        Ok(Self { file, stamp, bytes: metadata.len() })
    }

    pub(crate) fn all(&self) -> ArchiveSlice<'_> {
        ArchiveSlice::File(ArchiveRange { input: self, offset: 0, bytes: self.bytes })
    }

    pub(crate) fn check(&self) -> Result<()> {
        self.stamp.guard(&self.file)?;
        if self.file.metadata()?.len() != self.bytes {
            return Err(Error::Contract("backup input file length changed"));
        }
        Ok(())
    }

    pub(crate) fn check_named(
        &self,
        witness: &crate::log::generations::GenerationFileWitness,
        path: &std::path::Path,
    ) -> Result<()> {
        witness.guard(&self.file, path)?;
        self.check()
    }
}

impl<'a> ArchiveSlice<'a> {
    pub(crate) fn check(self) -> Result<()> {
        match self {
            Self::Bytes(_) => Ok(()),
            Self::File(range) => range.input.check(),
        }
    }

    pub(crate) fn len(self) -> u64 {
        match self {
            Self::Bytes(bytes) => bytes.len() as u64,
            Self::File(range) => range.bytes,
        }
    }

    pub(crate) fn section(self, offset: u64, bytes: u64) -> Result<Self> {
        if offset > self.len() || bytes > self.len() - offset {
            return Err(Error::Contract("backup input section bounds"));
        }
        Ok(match self {
            Self::Bytes(slice) => {
                let index = |value| {
                    usize::try_from(value)
                        .map_err(|_| Error::Contract("backup input section index"))
                };
                Self::Bytes(&slice[index(offset)?..index(offset + bytes)?])
            }
            Self::File(range) => {
                Self::File(ArchiveRange { offset: range.offset + offset, bytes, ..range })
            }
        })
    }

    pub(crate) fn read(self, limit: u64) -> Result<Cow<'a, [u8]>> {
        if self.len() > limit {
            return Err(Error::Contract("backup input section byte budget"));
        }
        match self {
            Self::Bytes(bytes) => Ok(Cow::Borrowed(bytes)),
            Self::File(mut range) => {
                let size = usize::try_from(range.bytes)
                    .map_err(|_| Error::Contract("backup input section allocation"))?;
                let mut bytes = vec![0; size];
                range.read_exact(&mut bytes)?;
                Ok(Cow::Owned(bytes))
            }
        }
    }

    pub(crate) fn digest(self) -> Result<[u8; 32]> {
        match self {
            Self::Bytes(bytes) => Ok(Sha256::digest(bytes).into()),
            Self::File(mut range) => {
                let bytes = range.bytes;
                let mut hash = ArchiveDigest::new(bytes);
                if io::copy(&mut range, &mut hash)? != bytes {
                    return Err(Error::Contract("backup input section truncated"));
                }
                Ok(hash.finish().0)
            }
        }
    }

    pub(crate) fn reader(self) -> impl Read + 'a {
        match self {
            Self::Bytes(bytes) => ReadSection::Bytes(bytes),
            Self::File(range) => ReadSection::File(range),
        }
    }

    pub(crate) fn header<T: DeserializeOwned + Serialize>(
        self,
        magic: &[u8],
        maximum: usize,
    ) -> Result<(T, Self)> {
        let prefix_len = (magic.len() + 4 + 32) as u64;
        let prefix = self.section(0, prefix_len)?.read(prefix_len)?;
        if !prefix.starts_with(magic) {
            return Err(Error::Contract("backup input framing"));
        }
        let at = magic.len();
        let length = u64::from(u32::from_be_bytes(
            prefix[at..at + 4].try_into().map_err(|_| Error::Contract("backup input header"))?,
        ));
        if length == 0 || length > maximum as u64 {
            return Err(Error::Contract("backup input header byte budget"));
        }
        let bytes = self.section(prefix_len, length)?.read(maximum as u64)?;
        if prefix[at + 4..] != <[u8; 32]>::from(Sha256::digest(&bytes)) {
            return Err(Error::Contract("backup input header checksum"));
        }
        let parsed: T = serde_json::from_slice(&bytes)?;
        if bytes != serde_json::to_vec(&parsed)? {
            return Err(Error::Contract("backup input header is not canonical"));
        }
        let start = prefix_len + length;
        Ok((parsed, self.section(start, self.len() - start)?))
    }

    pub(crate) fn file_offset(self) -> Result<u64> {
        match self {
            Self::File(range) => Ok(range.offset),
            Self::Bytes(_) => Err(Error::Contract("backup input requires file offset")),
        }
    }
}

enum ReadSection<'a> {
    Bytes(&'a [u8]),
    File(ArchiveRange<'a>),
}

impl Read for ReadSection<'_> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::Bytes(bytes) => bytes.read(buffer),
            Self::File(range) => range.read(buffer),
        }
    }
}

impl Read for ArchiveRange<'_> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::FileExt;
            let length = buffer.len().min(usize::try_from(self.bytes).unwrap_or(usize::MAX));
            if length == 0 {
                return Ok(0);
            }
            let read = self.input.file.read_at(&mut buffer[..length], self.offset)?;
            self.offset += read as u64;
            self.bytes -= read as u64;
            Ok(read)
        }
        #[cfg(not(unix))]
        {
            let _ = buffer;
            Err(io::Error::new(io::ErrorKind::Unsupported, "backup input requires Unix"))
        }
    }
}
