//! Retirement and explicit retry of actual file-lock cleanup, never epoch rollback.
use super::RoomDeploymentAuthority;
use crate::{Error, Result};
use std::{
    fs::File,
    sync::{TryLockError, atomic::Ordering},
};
impl RoomDeploymentAuthority {
    /// Retire this authority and all of its local leases immediately. In-flight
    /// native work keeps real custody until it settles. Retry this operation if
    /// work or failed OS unlock still retains custody. No file is deleted/reset,
    /// and a closed authority cannot grant another lease; reopen independently.
    /// File descriptors themselves remain owned until the last actual clone drops.
    /// # Errors
    /// Pending work returns Locked; failed unlock refuses success. Poisoned
    /// mutex custody can be used only for cleanup, never to admit more work.
    /// Retirement remains in effect after every failure.
    pub fn close(&self) -> Result<()> {
        self.state.closed.store(true, Ordering::Release);
        let file = match self.state.file.try_lock() {
            Ok(file) => file,
            Err(TryLockError::WouldBlock) => return Err(Error::Locked),
            Err(TryLockError::Poisoned(error)) => error.into_inner(),
        };
        File::unlock(&file)?;
        Ok(())
    }
}
