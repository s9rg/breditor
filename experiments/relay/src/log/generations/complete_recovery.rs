//! Finish read-only provenance replay without invoking physical rotation or tail repair.
use crate::{Error, Recovery, Result, log::Log};
use std::io::{Seek, SeekFrom};
impl Log {
    pub(crate) fn finish_complete_recovery(&mut self, recovery: Recovery) -> Result<()> {
        if recovery.truncated_bytes != 0 || self.file.metadata()?.len() != self.bytes {
            return Err(Error::Contract("complete replay cannot repair a native tail"));
        }
        self.ready()?;
        if let Some(state) = &mut self.generations {
            state.directory.absent(".rotation.json")?;
            state.verify_inventory()?;
            state.guard(&self.file, self.bytes)?;
            state.opening_length = None;
            state.guard(&self.file, self.bytes)?;
            state.directory.absent(".rotation.json")?;
        }
        self.file.seek(SeekFrom::Start(self.bytes))?;
        self.ready()
    }
}
