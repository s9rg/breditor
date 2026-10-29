//! Separate read operation for host-owned deployment authority.
use super::{
    authority::RoomDeploymentAuthority, identity::RoomDeploymentSelection, permit::Permit,
};
use crate::Result;
impl RoomDeploymentAuthority {
    /// Re-admit the complete current ledger under actual shared file custody.
    /// It must retain every epoch this live instance has already witnessed.
    /// # Errors
    /// Busy/changed/uncertain storage refuses; no incomplete prefix is selected.
    pub fn current_selection(&self) -> Result<RoomDeploymentSelection> {
        let mut held = Permit::try_acquire(&self.state, false)?;
        let selection = self.state.selected(held.file()?)?.selection;
        held.finish()?;
        Ok(selection)
    }
}
