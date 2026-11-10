//! Persisted source intent is DATA; the real epoch decides whether it was sealed.
pub(in crate::server) mod files;
mod identity;
mod interruption;
mod open;
mod prepare;
mod seal;
mod store;
use crate::{
    Result, ServerLogGenerationRoomBackup,
    server::{RoomDeploymentAuthority, deployment_fence},
};
pub use identity::PreparedLogGenerationHandoverIdentity;
#[cfg(test)]
pub(in crate::server) use interruption::Barrier;
pub(in crate::server) use interruption::{Interruption, Point};
#[cfg(test)]
pub(in crate::server) use prepare::prepare as prepare_with_interruption;
pub(in crate::server) use prepare::prepare_source;
use std::path::Path;
pub(in crate::server) use store::Store;

/// Point-in-time DATA from actual authority lineage, never a serving capability.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LogGenerationHandoverStatus {
    /// Complete prepared archive exists; its exact prior epoch is still current.
    Prepared,
    /// The exact source-bound planned epoch is retained, possibly below later epochs.
    Sealed,
    /// The prior epoch was superseded by an unrelated decision, not this source seal.
    Superseded,
}

/// Exclusive actual custody of a durably prepared source archive and immutable intent.
/// Retain its identity independently before sealing. Cold open never issues a lease.
/// Dropping releases file locks, not files; error/cancellation does not undo a fence.
/// Saved identity DATA cannot reconstruct actual prepared custody:
///
/// ```compile_fail
/// use breditor_collab_relay::server::PreparedLogGenerationHandover;
/// let _: PreparedLogGenerationHandover = serde_json::from_str("{}").unwrap();
/// ```
pub struct PreparedLogGenerationHandover {
    pub(in crate::server) store: Store,
}
impl PreparedLogGenerationHandover {
    /// Independently persist this complete choice before invoking the irreversible seal.
    #[must_use]
    pub fn identity(&self) -> &PreparedLogGenerationHandoverIdentity {
        &self.store.identity
    }
    /// Retained immutable complete DATA, not proof that an epoch was committed.
    #[must_use]
    pub fn source_backup(&self) -> &ServerLogGenerationRoomBackup {
        &self.store.backup
    }
    /// Actual private intent directory. It is never selected from a room archive.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.store.directory.path
    }
    /// Recheck all immutable files and actual complete epoch lineage. A larger
    /// counter alone cannot report Sealed; no state or source is changed here.
    /// # Errors
    /// Changed custody/bytes, invalid lineage, wrong authority or real lock contention refuse.
    pub fn status(
        &self,
        authority: &RoomDeploymentAuthority,
    ) -> Result<LogGenerationHandoverStatus> {
        self.store.guard()?;
        let result = deployment_fence::prepared_handover_status(authority, &self.store.identity)?;
        self.store.guard()?;
        Ok(result)
    }
}
