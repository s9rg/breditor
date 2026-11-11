//! Hold the selected deployment epoch while persisting an immutable checkpoint.
use super::{RoomDeploymentAuthority, RoomDeploymentSelection, journal, permit::Permit};
use crate::{Error, Result};

impl RoomDeploymentAuthority {
    pub(in crate::server) fn with_checkpoint_epoch<T>(
        &self,
        expected: &RoomDeploymentSelection,
        sealed: &RoomDeploymentSelection,
        write: impl FnOnce() -> Result<T>,
    ) -> Result<T> {
        let mut permit = Permit::try_acquire(&self.state, false)?;
        let before = self.state.selected(permit.file()?)?;
        if &before.selection != expected {
            return Err(Error::Lease);
        }
        journal::retains_selection(
            permit.file()?,
            &self.state.header_digest,
            self.state.offset,
            &before,
            sealed,
        )?;
        let result = write();
        let checked = self.state.selected(permit.file()?).and_then(|after| {
            if &after.selection == expected { Ok(()) } else { Err(Error::Lease) }
        });
        let released = permit.finish();
        let prepared = result?;
        checked?;
        released?;
        self.state.healthy()?;
        Ok(prepared)
    }
}
