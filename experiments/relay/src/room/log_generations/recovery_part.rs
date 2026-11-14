//! A checked source for an insert-only restore part and its durable prefix.
use crate::{Error, Result, archive_input::ArchiveSlice};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom},
};

#[derive(Clone, Copy)]
pub(super) struct RecoveryPart<'a> {
    source: ArchiveSlice<'a>,
    pub(super) sha256: [u8; 32],
}

impl<'a> RecoveryPart<'a> {
    pub(super) fn from_bytes(bytes: &'a [u8]) -> Self {
        Self { source: ArchiveSlice::Bytes(bytes), sha256: Sha256::digest(bytes).into() }
    }

    pub(super) fn with_digest(source: ArchiveSlice<'a>, sha256: [u8; 32]) -> Self {
        Self { source, sha256 }
    }

    pub(super) fn len(self) -> u64 {
        self.source.len()
    }

    pub(super) fn compare(self, file: &mut File, partial: bool) -> Result<u64> {
        let length = file.metadata()?.len();
        if length > self.len() || !partial && length != self.len() {
            return Err(Error::Contract("generation recovery file length"));
        }
        file.seek(SeekFrom::Start(0))?;
        let mut reader = self.source.reader();
        let mut actual = [0_u8; 8192];
        let mut expected = [0_u8; 8192];
        let mut offset = 0;
        let mut digest = Sha256::new();
        while offset < length {
            let remaining = usize::try_from(length - offset).unwrap_or(usize::MAX);
            let count = actual.len().min(remaining);
            file.read_exact(&mut actual[..count])?;
            reader.read_exact(&mut expected[..count])?;
            if actual[..count] != expected[..count] {
                return Err(Error::Contract("generation recovery file changed"));
            }
            digest.update(&actual[..count]);
            offset += count as u64;
        }
        if file.read(&mut actual[..1])? != 0 {
            return Err(Error::Contract("generation recovery file grew"));
        }
        if length == self.len() && <[u8; 32]>::from(digest.finalize()) != self.sha256 {
            return Err(Error::Contract("generation recovery file digest differs"));
        }
        Ok(length)
    }

    pub(super) fn append(self, file: &mut File, offset: u64, length: u64) -> Result<()> {
        let mut reader = self.source.section(offset, length)?.reader();
        if io::copy(&mut reader, file)? != length {
            return Err(Error::Contract("generation recovery source truncated"));
        }
        Ok(())
    }
}
