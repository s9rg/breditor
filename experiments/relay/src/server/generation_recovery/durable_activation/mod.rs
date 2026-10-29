//! Durable whole native/raster target cuts. Stored DATA never reissues a lease.
mod activate;
mod identity;
mod open;
mod prepare;
mod store;
use crate::{
    Result, ServerLogGenerationRoomBackup,
    server::{
        LogGenerationHandoverStatus, PreparedLogGenerationHandover, RoomDeploymentAuthority,
        deployment_fence,
    },
};
pub use identity::PreparedNativeGenerationActivationIdentity;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
/// Trusted host provisioning inputs, not a portable activation capability.
pub struct NativeGenerationActivationPrepareOptions {
    /// Absent private checkpoint directory. Existing or partial data is never overwritten.
    pub root: PathBuf,
    /// Independently configured real serving authority, never selected by archive metadata.
    pub authority: RoomDeploymentAuthority,
}
/// Read-only actual epoch lineage result, never native service authority.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum NativeGenerationActivationCheckpointStatus {
    /// The exact prior epoch is current; the target may still need a fresh cut check.
    Prepared,
    /// The exact target-bound decision is retained, possibly below later valid epochs.
    Committed,
    /// An unrelated decision superseded the prior epoch.
    Superseded,
}
/// Actual immutable checkpoint and original source custody, not a lease or router.
/// Cold open requires an independently retained identity and actual original files.
/// ```compile_fail
/// use breditor_collab_relay::server::PreparedNativeGenerationActivation;
/// let _:PreparedNativeGenerationActivation=serde_json::from_str("{}").unwrap();
/// ```
pub struct PreparedNativeGenerationActivation {
    pub(in crate::server) store: store::Store,
    pub(in crate::server) source: Arc<PreparedLogGenerationHandover>,
}
impl PreparedNativeGenerationActivation {
    /// Persist independently before committing this target decision.
    #[must_use]
    pub fn identity(&self) -> &PreparedNativeGenerationActivationIdentity {
        &self.store.identity
    }
    /// Complete immutable checkpoint DATA; no currentness or serving permission.
    #[must_use]
    pub fn checkpoint(&self) -> &ServerLogGenerationRoomBackup {
        &self.store.backup
    }
    /// Actual exclusively owned private checkpoint root.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.store.directory.path
    }
    pub(in crate::server) fn guard(&self) -> Result<()> {
        self.source.store.guard()?;
        self.store.guard()?;
        self.source.store.guard()
    }
    /// Inspect the actual retained prior/planned nonces after rechecking all files.
    /// # Errors
    /// Wrong authority, changed original/checkpoint custody, divergent ledger or I/O refuse.
    pub fn status(
        &self,
        authority: &RoomDeploymentAuthority,
    ) -> Result<NativeGenerationActivationCheckpointStatus> {
        self.guard()?;
        let result = deployment_fence::prepared_decision_status(
            authority,
            self.identity().previous_selection(),
            self.identity().planned_selection(),
        )?;
        self.guard()?;
        Ok(match result {
            LogGenerationHandoverStatus::Prepared => {
                NativeGenerationActivationCheckpointStatus::Prepared
            }
            LogGenerationHandoverStatus::Sealed => {
                NativeGenerationActivationCheckpointStatus::Committed
            }
            LogGenerationHandoverStatus::Superseded => {
                NativeGenerationActivationCheckpointStatus::Superseded
            }
        })
    }
}
