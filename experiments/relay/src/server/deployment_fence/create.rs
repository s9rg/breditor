//! Separate create operation for host-owned deployment authority.
use super::{
    authority::{RoomDeploymentAuthority, options},
    identity::{RoomDeploymentIdentity, key},
    journal, location,
    observation::EpochObservation,
    state::State,
};
use crate::{Error, Result, credentials};
use std::{
    fs::{DirBuilder, File},
    io::Write,
    path::Path,
    sync::{Arc, Mutex, atomic::AtomicBool},
};
impl RoomDeploymentAuthority {
    /// Create only a new private namespace. Existing paths are never adopted,
    /// overwritten, repaired or reset. Keep the returned identity independently.
    /// # Errors
    /// Existing/aliased paths, unsupported identity backend, wrong binding, I/O
    /// or entropy failure refuses without granting any serving lease.
    pub fn create(root: &Path, binding: &str) -> Result<Self> {
        Self::create_with_revision(root, binding, 1)
    }

    /// Create a private authority that requires a verified continuation after a coordinated seal
    /// or handover. Before that first transition, ordinary CAS claims work as in revision one.
    /// Retain the returned identity and an independently verified latest selection for cold opens.
    ///
    /// # Errors
    /// Existing or aliased paths, an unsupported backend, wrong binding, I/O or entropy failure
    /// refuses without granting a lease.
    pub fn create_with_coordinated_recovery(root: &Path, binding: &str) -> Result<Self> {
        Self::create_with_revision(root, binding, 2)
    }

    fn create_with_revision(root: &Path, binding: &str, format_version: u32) -> Result<Self> {
        location::supported()?;
        key(binding)?;
        let mut builder = DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(root)?;
        let root = root.canonicalize()?;
        let directory = File::open(&root)?;
        let mut file = options().create_new(true).open(root.join("authority.log"))?;
        location::check(&root, &directory, &file)?;
        File::try_lock(&file).map_err(super::permit::lock_error)?;
        let identity = RoomDeploymentIdentity {
            format: "breditor/room-deployment-authority".into(),
            format_version,
            authority: credentials::issue()?,
            binding: binding.into(),
        };
        let bytes = journal::header(&identity)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        directory.sync_all()?;
        File::open(root.parent().ok_or(Error::Contract("deployment directory parent"))?)?
            .sync_all()?;
        let header = journal::read_header(&mut file)?;
        File::unlock(&file)?;
        Ok(Self {
            state: Arc::new(State {
                root,
                directory,
                file: Mutex::new(file),
                identity,
                header_digest: header.digest,
                offset: header.offset,
                cold_floor: None,
                observed: Mutex::new(EpochObservation::empty(header.digest)),
                poisoned: AtomicBool::new(false),
                closed: AtomicBool::new(false),
            }),
        })
    }
}
