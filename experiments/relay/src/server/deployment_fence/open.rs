//! Separate open operation for host-owned deployment authority.
use super::{
    authority::{RoomDeploymentAuthority, options},
    identity::RoomDeploymentIdentity,
    journal, location,
    observation::EpochObservation,
    state::State,
};
use crate::{Error, Result};
use std::{
    fs::{self, File},
    path::Path,
    sync::{Arc, Mutex, atomic::AtomicBool},
};
impl RoomDeploymentAuthority {
    /// Reopen exact existing complete bytes with an outside namespace pin. This
    /// returns authority custody, never a lease for a saved/current generation.
    /// This legacy method pins the namespace identity, not a minimum history.
    /// Use `Self::open_at_least` with an independently retained selection when
    /// cold continuity must reject an older complete prefix or divergent branch.
    /// # Errors
    /// Missing/replaced files, unknown or incomplete records, wrong pins,
    /// unsupported identity backend, current lock contention and I/O refuse.
    pub fn open(root: &Path, expected: &RoomDeploymentIdentity) -> Result<Self> {
        location::supported()?;
        expected.validate()?;
        if !fs::symlink_metadata(root)?.is_dir()
            || !fs::symlink_metadata(root.join("authority.log"))?.is_file()
        {
            return Err(Error::Contract("deployment namespace files"));
        }
        let root = root.canonicalize()?;
        let directory = File::open(&root)?;
        let mut file = options().open(root.join("authority.log"))?;
        location::check(&root, &directory, &file)?;
        File::try_lock_shared(&file).map_err(super::permit::lock_error)?;
        let (header, current) = journal::current(&mut file)?;
        if &header.identity != expected {
            return Err(Error::Contract("deployment namespace pin"));
        }
        File::unlock(&file)?;
        Ok(Self {
            state: Arc::new(State {
                root,
                directory,
                file: Mutex::new(file),
                identity: expected.clone(),
                header_digest: header.digest,
                offset: header.offset,
                cold_floor: None,
                observed: Mutex::new(EpochObservation::current(&current)),
                poisoned: AtomicBool::new(false),
                closed: AtomicBool::new(false),
            }),
        })
    }
}
