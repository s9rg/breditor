//! Restore the exact original checkpoint stream from a raw or compressed archive range.
use super::ArchiveInput;
use crate::{Error, Result, archive_digest::ArchiveDigest};
#[cfg(feature = "server")]
use std::io::BufRead;
use std::io::{self, Read, Write};

pub(crate) struct CheckpointInput {
    pub(crate) input: ArchiveInput,
    bytes: u64,
}

impl CheckpointInput {
    pub(crate) fn raw(input: ArchiveInput) -> Self {
        let bytes = input.all().len();
        Self { input, bytes }
    }

    #[cfg(feature = "server")]
    pub(crate) fn packed(input: ArchiveInput, bytes: u64, limit: u64) -> Result<Self> {
        let stored = input.all().len();
        if stored == 0 || stored > bytes || bytes > limit {
            return Err(Error::Contract("packed checkpoint byte budget"));
        }
        Ok(Self { input, bytes })
    }

    pub(crate) fn len(&self) -> u64 {
        self.bytes
    }

    pub(crate) fn digest(&self) -> Result<[u8; 32]> {
        if self.bytes == self.input.all().len() {
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
        let result = if self.bytes == self.input.all().len() {
            Self::visit_exact(&mut raw, self.bytes, visit)?
        } else {
            #[cfg(feature = "server")]
            {
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
            }
            #[cfg(not(feature = "server"))]
            return Err(Error::Contract("packed checkpoint requires server archive support"));
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
