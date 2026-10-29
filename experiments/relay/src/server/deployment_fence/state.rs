//! Actual authority-file custody, shared by clones without cloning lock descriptors.
use super::{identity::RoomDeploymentIdentity, journal, location, observation::EpochObservation};
use crate::{Error, Result};
use std::{
    fs::File,
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
};
pub(super) struct State {
    pub root: PathBuf,
    pub directory: File,
    pub file: Mutex<File>,
    pub identity: RoomDeploymentIdentity,
    pub header_digest: [u8; 32],
    pub offset: u64,
    pub observed: Mutex<EpochObservation>,
    pub poisoned: AtomicBool,
    pub closed: AtomicBool,
}
impl State {
    pub fn healthy(&self) -> Result<()> {
        if self.closed.load(Ordering::Acquire) {
            Err(Error::Lease)
        } else if self.poisoned.load(Ordering::Acquire) {
            Err(Error::NeedsRecovery)
        } else {
            Ok(())
        }
    }
    pub fn check_file(&self, file: &File) -> Result<()> {
        self.healthy()?;
        let result = location::check(&self.root, &self.directory, file);
        if result.is_err() {
            self.poisoned.store(true, Ordering::Release);
        }
        result
    }
    pub fn selected(&self, file: &mut File) -> Result<journal::Current> {
        let result = (|| {
            self.check_file(file)?;
            let (header, current) = journal::current(file)?;
            if header.identity != self.identity
                || header.digest != self.header_digest
                || header.offset != self.offset
            {
                return Err(Error::Contract("deployment authority differs"));
            }
            self.observe_current(file, &current)?;
            self.check_file(file)?;
            Ok(current)
        })();
        if result.is_err() {
            self.poisoned.store(true, Ordering::Release);
        }
        result
    }
}
