//! Read the incomplete active frame while holding the selected log and directory.
use super::capture::GenerationFiles;
use crate::{Error, Result, log::Log};
use std::io::{Read, Seek, SeekFrom};

#[cfg(feature = "server")]
#[derive(Clone, Debug, Eq, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SelectedNativeTailPrefix {
    pub(crate) manifest: [u8; 32],
    pub(crate) records: u64,
    pub(crate) terminal_digest: [u8; 32],
    active_bytes: u64,
    active_file: super::GenerationFileWitness,
}

#[cfg(feature = "server")]
impl Log {
    pub(crate) fn select_native_tail_prefix(&self) -> Result<SelectedNativeTailPrefix> {
        self.check_generation_replay()?;
        let state = self.generations.as_ref().ok_or(Error::NeedsRecovery)?;
        state.directory.absent(".rotation.json")?;
        let prefix = SelectedNativeTailPrefix {
            manifest: state.current().hash,
            records: self.next,
            terminal_digest: self.previous,
            active_bytes: self.bytes,
            active_file: super::GenerationFileWitness::of(&self.file)?,
        };
        self.ready()?;
        Ok(prefix)
    }
}

impl Log {
    pub(crate) fn has_incomplete_generation_tail(&self) -> Result<bool> {
        self.ready()?;
        Ok(self
            .generations
            .as_ref()
            .and_then(|state| state.opening_length)
            .is_some_and(|length| length > self.bytes))
    }

    pub(crate) fn capture_inspected_generation_prefix(
        &mut self,
    ) -> Result<(GenerationFiles, Vec<u8>)> {
        let suffix = self.read_incomplete_generation_tail()?;
        let files = self.capture_generation_files_with_prefix(Some(self.bytes))?;
        Ok((files, suffix))
    }

    pub(crate) fn read_incomplete_generation_tail(&mut self) -> Result<Vec<u8>> {
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
        let capacity = usize::try_from(tail_bytes)
            .map_err(|_| Error::Contract("incomplete native tail byte budget"))?;
        let mut suffix = Vec::new();
        suffix
            .try_reserve_exact(capacity)
            .map_err(|_| Error::Contract("incomplete native tail memory budget"))?;
        self.file.seek(SeekFrom::Start(self.bytes))?;
        (&mut self.file).take(tail_bytes).read_to_end(&mut suffix)?;
        if suffix.len() != capacity {
            return Err(Error::Contract("incomplete native tail changed during read"));
        }
        self.ready()?;
        Ok(suffix)
    }
}
