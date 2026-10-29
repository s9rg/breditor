//! Separate claim operation for host-owned deployment authority.
use super::{
    authority::RoomDeploymentAuthority, identity::RoomDeploymentSelection, journal,
    lease::RoomDeploymentLease, permit::Permit,
};
use crate::{Error, Result};
use std::{
    io::{Seek, SeekFrom, Write},
    sync::atomic::Ordering,
};
impl RoomDeploymentAuthority {
    /// Append and sync exactly one fresh epoch after an exact outside CAS choice.
    /// Every in-flight serving transaction must release its real shared lock
    /// before this exclusive operation succeeds. Stale choices append nothing.
    /// Retrying always requires a fresh choice; saved data never reissues a lease.
    /// # Errors
    /// Busy workers, stale choice, wrong namespace, exhausted epoch budget,
    /// malformed storage, entropy or uncertain append/sync/unlock refuses.
    pub fn claim(&self, expected: &RoomDeploymentSelection) -> Result<RoomDeploymentLease> {
        let mut held = Permit::try_acquire(&self.state, true)?;
        let lease = self.claim_held(&mut held, expected)?;
        held.finish()?;
        self.state.healthy()?;
        Ok(lease)
    }
    // Internal only: callers must already hold this authority's exclusive
    // permit. No public callback or detached validation flag can reach this.
    pub(super) fn claim_held(
        &self,
        held: &mut Permit<'_>,
        expected: &RoomDeploymentSelection,
    ) -> Result<RoomDeploymentLease> {
        held.check_authority(&self.state)?;
        let current = self.state.selected(held.file()?)?;
        if &current.selection != expected {
            return Err(Error::Lease);
        }
        if current.count >= journal::MAX_CLAIMS {
            return Err(Error::Contract("deployment epoch budget"));
        }
        let generation = current.count + 1;
        let mut nonce = [0; 32];
        getrandom::fill(&mut nonce).map_err(|_| Error::Entropy)?;
        let bytes = journal::frame(&self.state.header_digest, generation, &nonce, &current.digest);
        self.state.check_file(held.file()?)?;
        let written = (|| {
            let file = held.file()?;
            file.seek(SeekFrom::End(0))?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            self.state.directory.sync_all()?;
            self.state.check_file(file)?;
            Ok::<_, Error>(())
        })();
        if let Err(error) = written {
            self.state.poisoned.store(true, Ordering::Release);
            return Err(error);
        }
        self.state.observe_committed(held.file()?, generation, &bytes)?;
        let selection = RoomDeploymentSelection {
            identity: self.identity(),
            generation: generation.to_string(),
            owner: Some(journal::nonce(&nonce)),
        };
        Ok(RoomDeploymentLease::new(self.state.clone(), selection, generation, bytes))
    }
}
