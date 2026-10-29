//! Remember witnessed history independently of later bytes at the same inode.
//! This is a live-instance continuity floor, not a substitute for independently
//! retained cold state. Identity-only opening cannot detect a complete old
//! prefix when it has no witness that anything later ever existed.
//! Hot admission checks the witnessed anchor in constant space and fixed reads.
//! Retirement replays a newer chain once, closes that lease permanently, and
//! remembers the newly observed head. No journal format or old bytes are changed.
use super::{journal, state::State};
use crate::{Error, Result};
use std::{fs::File, sync::atomic::Ordering};

pub(super) struct EpochObservation {
    count: u64,
    digest: [u8; 32],
}
impl EpochObservation {
    pub fn empty(header: [u8; 32]) -> Self {
        Self { count: 0, digest: header }
    }
    pub fn current(current: &journal::Current) -> Self {
        Self { count: current.count, digest: current.digest }
    }
}
impl State {
    /// Hot admission checks one witnessed anchor, never replays the whole ledger.
    pub fn check_observed(&self, file: &mut File) -> Result<()> {
        let result = (|| {
            let observed = self.observed.lock().map_err(|_| Error::NeedsRecovery)?;
            if journal::count(file, self.offset)? < observed.count {
                return Err(Error::NeedsRecovery);
            }
            journal::check_anchor(
                file,
                &self.header_digest,
                self.offset,
                observed.count,
                &observed.digest,
            )
        })();
        if result.is_err() {
            self.poisoned.store(true, Ordering::Release);
        }
        result
    }

    /// Full replay must retain the previously witnessed prefix before advancing.
    pub fn observe_current(&self, file: &mut File, current: &journal::Current) -> Result<()> {
        self.check_observed(file)?;
        let mut observed = self.observed.lock().map_err(|_| Error::NeedsRecovery)?;
        if current.count < observed.count || journal::count(file, self.offset)? < current.count {
            return Err(Error::NeedsRecovery);
        }
        journal::check_anchor(
            file,
            &self.header_digest,
            self.offset,
            current.count,
            &current.digest,
        )?;
        *observed = EpochObservation::current(current);
        Ok(())
    }

    /// Before returning a newly appended lease, read back its exact current frame
    /// and keep the old witnessed anchor. A partial/changed append never grants.
    pub fn observe_committed(
        &self,
        file: &mut File,
        generation: u64,
        bytes: &[u8; 104],
    ) -> Result<()> {
        let result = (|| {
            self.check_observed(file)?;
            journal::check_lease(
                file,
                &self.identity,
                &self.header_digest,
                self.offset,
                generation,
                bytes,
            )
            .map_err(|_| Error::NeedsRecovery)?;
            let mut observed = self.observed.lock().map_err(|_| Error::NeedsRecovery)?;
            *observed = EpochObservation {
                count: generation,
                digest: bytes[72..].try_into().map_err(|_| Error::NeedsRecovery)?,
            };
            Ok(())
        })();
        if result.is_err() {
            self.poisoned.store(true, Ordering::Release);
        }
        result
    }
}
