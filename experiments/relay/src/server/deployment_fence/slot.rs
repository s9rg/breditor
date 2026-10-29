//! All clones share one attachment decision, held through actual native work.
//! Snapshotting `None` before a worker starts could leave a pre-activation
//! clone unfenced forever after a different clone attaches a serving epoch.
use super::RoomDeploymentLease;
use crate::{Error, Result};
use std::sync::{
    Arc, RwLock,
    atomic::{AtomicBool, Ordering},
};

#[derive(Clone)]
pub(in crate::server) struct HostDeployment {
    state: Arc<RwLock<Option<RoomDeploymentLease>>>,
    retired: Arc<AtomicBool>,
}
impl HostDeployment {
    /// Explicit legacy behavior, not an executable serving capability.
    pub fn unfenced() -> Self {
        Self { state: Arc::new(RwLock::new(None)), retired: Arc::new(AtomicBool::new(false)) }
    }

    fn check_retired(&self) -> Result<()> {
        if self.retired.load(Ordering::Acquire) { Err(Error::NeedsRecovery) } else { Ok(()) }
    }

    /// Keep the shared guard through native work, fsync and real epoch postchecks.
    pub fn transaction<T>(&self, work: impl FnOnce() -> Result<T>) -> Result<T> {
        let held = self.state.read().map_err(|_| Error::NeedsRecovery)?;
        self.check_retired()?;
        super::transaction(held.as_ref(), work)
    }

    /// Stabilize attachment while a complete capture or exclusive seal uses it.
    pub fn fenced<T>(&self, work: impl FnOnce(&RoomDeploymentLease) -> Result<T>) -> Result<T> {
        let held = self.state.read().map_err(|_| Error::NeedsRecovery)?;
        self.check_retired()?;
        let lease = held.as_ref().ok_or(Error::Contract("fenced source host required"))?;
        work(lease)
    }

    /// Private activation worker retains the shared attachment write exclusion
    /// through its actual native/epoch checks, durable append and publication.
    /// The worker must leave any possibly durable decision fenced on error.
    pub(super) fn activate<T>(
        &self,
        work: impl FnOnce(&mut ActivationSlot<'_>) -> Result<T>,
    ) -> Result<T> {
        let mut held = self.state.write().map_err(|_| Error::NeedsRecovery)?;
        self.check_retired()?;
        if held.is_some() {
            return Err(Error::Contract("host deployment already attached"));
        }
        work(&mut ActivationSlot { lease: &mut held, retired: &self.retired })
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
        self.check_retired()?;
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
/// A commit can become durable without returning a lease. This separate shared
/// retirement bit prevents None from ever becoming an unfenced fallback then.
pub(super) struct ActivationSlot<'a> {
    lease: &'a mut Option<RoomDeploymentLease>,
    retired: &'a AtomicBool,
}
impl ActivationSlot<'_> {
    pub(super) fn begin_commit(&self) {
        self.retired.store(true, Ordering::Release);
    }
    pub(super) fn publish(&mut self, lease: RoomDeploymentLease) {
        *self.lease = Some(lease);
    }
    pub(super) fn finish(&self) -> Result<()> {
        if self.lease.is_none() || !self.retired.load(Ordering::Acquire) {
            return Err(Error::NeedsRecovery);
        }
        self.retired.store(false, Ordering::Release);
        Ok(())
    }
}
#[cfg(test)]
mod tests;
