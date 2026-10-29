//! All clones share one attachment decision, held through actual native work.
//! Snapshotting `None` before a worker starts could leave a pre-activation
//! clone unfenced forever after a different clone attaches a serving epoch.
use super::RoomDeploymentLease;
use crate::{Error, Result};
use std::sync::{Arc, RwLock};

#[derive(Clone)]
pub(in crate::server) struct HostDeployment {
    state: Arc<RwLock<Option<RoomDeploymentLease>>>,
}
impl HostDeployment {
    /// Explicit legacy behavior, not an executable serving capability.
    pub fn unfenced() -> Self {
        Self { state: Arc::new(RwLock::new(None)) }
    }

    /// Keep the shared guard through native work, fsync and real epoch postchecks.
    pub fn transaction<T>(&self, work: impl FnOnce() -> Result<T>) -> Result<T> {
        let held = self.state.read().map_err(|_| Error::NeedsRecovery)?;
        super::transaction(held.as_ref(), work)
    }

    /// Stabilize attachment while a complete capture or exclusive seal uses it.
    pub fn fenced<T>(&self, work: impl FnOnce(&RoomDeploymentLease) -> Result<T>) -> Result<T> {
        let held = self.state.read().map_err(|_| Error::NeedsRecovery)?;
        let lease = held.as_ref().ok_or(Error::Contract("fenced source host required"))?;
        work(lease)
    }

    /// Private one-time publication, never a recovered-room activation approval.
    /// Wait for admitted unfenced work. Publish inside the real epoch permit;
    /// uncertain postchecks keep the slot fenced, never roll it back to `None`.
    pub(super) fn attach(
        &self,
        lease: RoomDeploymentLease,
        validate: impl FnOnce() -> Result<()>,
    ) -> Result<()> {
        let mut held = self.state.write().map_err(|_| Error::NeedsRecovery)?;
        if held.is_some() {
            return Err(Error::Contract("host deployment already attached"));
        }
        let admission = lease.clone();
        super::transaction(Some(&admission), || {
            validate()?;
            *held = Some(lease);
            Ok(())
        })
    }
}
#[cfg(test)]
mod tests;
