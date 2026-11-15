//! A portable backup includes each linked native component needed to open the retained cut.
use super::{
    capture::begin_capture,
    native_lineage::NativeLineage,
    retained_backup::{
        RelaySegmentRetainedBackup, RelaySegmentRetainedBackupIdentity, RetainedCopies,
    },
};
use crate::{
    RelaySegmentBaseIdentity, Result, log::generations::GenerationDirectory,
    server::ServerBackupHandle,
};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Independently selected portable room cut and all its linked native predecessors.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentPortableBackupIdentity {
    /// Latest native and raster cut with all retained client input pins.
    pub retained: RelaySegmentRetainedBackupIdentity,
    /// Oldest to newest. Each pair is named `native-lineage/{index}.archive` and
    /// `native-lineage/{index}.checkpoint`.
    pub native_predecessors: Vec<RelaySegmentBaseIdentity>,
}

impl RelaySegmentRetainedBackup {
    /// Open a portable bundle using its independently saved identity.
    /// Every linked predecessor is verified from the bundle itself.
    ///
    /// # Errors
    /// Refuses incomplete or altered files, changed membership, or a different native lineage.
    pub fn open_portable(
        path: &Path,
        expected: &RelaySegmentPortableBackupIdentity,
    ) -> Result<Self> {
        let directory = GenerationDirectory::open(path)?;
        let lineage = NativeLineage::open(&directory, &expected.native_predecessors)?;
        let backup = Self::open_at(&directory, lineage.parent(), &expected.retained)?;
        lineage.check()?;
        directory.guard()?;
        Ok(backup)
    }
}

impl ServerBackupHandle {
    /// Capture the exact native and raster cut, its native predecessor chain, and the
    /// client archives already held by the relay. Retain the returned identity independently.
    /// Predecessors and client archives copy outside the initial serving transaction.
    /// Run this blocking operation off async I/O workers.
    ///
    /// # Errors
    /// Refuses invalid owner authentication, a superseded epoch, changed files and occupied destinations.
    /// Retry a failed capture at another absent path.
    pub fn capture_portable_relay_segment(
        &self,
        principal: &str,
        token: &str,
        destination: &Path,
    ) -> Result<RelaySegmentPortableBackupIdentity> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        let (captured, source_epoch) = begin_capture(host, principal, destination)?;
        let (retained, client_copies) = RetainedCopies::capture(host, &captured, source_epoch)?;
        let (native_predecessors, lineage) =
            NativeLineage::export(&captured.directory, captured.parent.as_deref())?;
        captured.confirm(host, &retained.source_epoch, || {
            if let Some(parent) = &captured.parent {
                parent.check()?;
            }
            lineage.check()?;
            client_copies.check()
        })?;
        Ok(RelaySegmentPortableBackupIdentity { retained, native_predecessors })
    }
}
