//! Restore the exact original checkpoint stream from a raw or compressed archive range.
use super::ArchiveInput;
use crate::{Error, Result, archive_digest::ArchiveDigest};
use std::io::BufRead;
use std::io::{self, Read, Write};

pub(crate) struct CheckpointInput {
    pub(crate) input: ArchiveInput,
    bytes: u64,
    storage: Storage,
}

#[derive(PartialEq, Eq)]
enum Storage {
    Raw,
    #[cfg(feature = "server")]
    Gzip,
    Terminal,
}

impl CheckpointInput {
    pub(crate) fn raw(input: ArchiveInput) -> Self {
        let bytes = input.all().len();
        Self { input, bytes, storage: Storage::Raw }
    }

    #[cfg(feature = "server")]
    pub(crate) fn packed(input: ArchiveInput, bytes: u64, limit: u64) -> Result<Self> {
        let stored = input.all().len();
        if stored == 0 || stored > bytes || bytes > limit {
            return Err(Error::Contract("packed checkpoint byte budget"));
        }
        let storage = if stored == bytes { Storage::Raw } else { Storage::Gzip };
        Ok(Self { input, bytes, storage })
    }

    pub(super) fn terminal(input: ArchiveInput, bytes: u64) -> Self {
        Self { input, bytes, storage: Storage::Terminal }
    }

    pub(crate) fn is_terminal(&self) -> bool {
        self.storage == Storage::Terminal
    }

    pub(crate) fn len(&self) -> u64 {
        self.bytes
    }

    pub(crate) fn digest(&self) -> Result<[u8; 32]> {
        if self.storage == Storage::Raw {
            return self.input.all().digest();
        }
        let mut output = ArchiveDigest::new(self.bytes);
        self.write_to(&mut output)?;
        Ok(output.finish().0)
    }

    pub(crate) fn write_to(&self, output: &mut dyn Write) -> Result<()> {
        self.visit(|reader| {
            io::copy(reader, output)?;
            Ok(())
        })
    }

    pub(crate) fn visit<T>(&self, visit: impl FnOnce(&mut dyn Read) -> Result<T>) -> Result<T> {
        self.input.check()?;
        let mut raw = self.input.all().reader();
        let result = if self.storage == Storage::Raw {
            Self::visit_exact(&mut raw, self.bytes, visit)?
        } else {
            let mut raw = io::BufReader::new(raw);
            if !raw.fill_buf()?.starts_with(&[0x1f, 0x8b, 8, 0]) {
                return Err(Error::Contract("packed checkpoint requires a fixed gzip header"));
            }
            let mut decoded = flate2::bufread::GzDecoder::new(raw);
            let result = Self::visit_exact(&mut decoded, self.bytes, visit)?;
            if !decoded.into_inner().fill_buf()?.is_empty() {
                return Err(Error::Contract("packed checkpoint has trailing bytes"));
            }
            result
        };
        self.input.check()?;
        Ok(result)
    }

    fn visit_exact<T>(
        reader: &mut dyn Read,
        bytes: u64,
        visit: impl FnOnce(&mut dyn Read) -> Result<T>,
    ) -> Result<T> {
        let mut bounded = reader.take(bytes);
        let result = visit(&mut bounded)?;
        if bounded.limit() != 0 || bounded.into_inner().read(&mut [0])? != 0 {
            return Err(Error::Contract("checkpoint original byte count differs"));
        }
        Ok(result)
    }
}
