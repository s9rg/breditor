//! Read the incomplete active frame while holding the selected log and directory.
use super::capture::GenerationFiles;
use crate::{Error, Result, log::Log};
use sha2::{Digest, Sha256};
use std::io::{Read, Seek, SeekFrom};

impl Log {
    pub(crate) fn capture_inspected_generation_prefix(
        &mut self,
    ) -> Result<(GenerationFiles, u64, [u8; 32])> {
        self.ready()?;
        let length = self
            .generations
            .as_ref()
            .and_then(|state| state.opening_length)
            .ok_or(Error::Contract("incomplete tail inspection requires an opening log"))?;
        let tail_bytes = length
            .checked_sub(self.bytes)
            .filter(|bytes| *bytes > 0)
            .ok_or(Error::Contract("no incomplete native tail to inspect"))?;
        let mut digest = Sha256::new();
        self.file.seek(SeekFrom::Start(self.bytes))?;
        let mut tail = (&mut self.file).take(tail_bytes);
        let mut buffer = [0; 8192];
        while tail.limit() != 0 {
            let count = tail.read(&mut buffer)?;
            if count == 0 {
                return Err(Error::Contract("incomplete native tail changed during read"));
            }
            digest.update(&buffer[..count]);
        }
        self.ready()?;
        let files = self.capture_generation_files_with_prefix(Some(self.bytes))?;
        Ok((files, tail_bytes, digest.finalize().into()))
    }
}
