//! Synchronize the selected active prefix without publishing a rotation or replacing its inode.
mod interruption;
pub(crate) use interruption::{NativeTailRepairInterruption, NativeTailRepairPoint};

use crate::{Error, Recovery, Result, log::Log};

impl Log {
    pub(crate) fn complete_inspected_generation_prefix(
        &mut self,
        suffix_bytes: u64,
        interruption: NativeTailRepairInterruption,
    ) -> Result<()> {
        self.ready()?;
        let state = self
            .generations
            .as_ref()
            .ok_or(Error::Contract("native tail repair requires generation storage"))?;
        state.directory.absent(".rotation.json")?;
        state.verify_inventory()?;
        state.directory.absent(".rotation.json")?;
        let length = self
            .bytes
            .checked_add(suffix_bytes)
            .ok_or(Error::Contract("native tail repair length overflow"))?;
        if self.file.metadata()?.len() != length
            || state.opening_length != (suffix_bytes != 0).then_some(length)
        {
            return Err(Error::Contract("native tail repair active length changed"));
        }
        self.ready()?;
        if suffix_bytes != 0 {
            interruption.reached(NativeTailRepairPoint::BeforeTruncate);
            self.file.set_len(self.bytes)?;
            interruption.reached(NativeTailRepairPoint::Truncated);
        }
        // A retry after an ambiguous sync also synchronizes the selected already-complete cut.
        self.file.sync_all()?;
        interruption.reached(NativeTailRepairPoint::Synced);
        let state = self.generations.as_mut().ok_or(Error::NeedsRecovery)?;
        state.refresh_active(&self.file)?;
        state.opening_length = None;
        self.finish_complete_recovery(Recovery::default())
    }
}
