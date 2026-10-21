//! Explicit operator lifetime retains actual owners; routers retain only a weak reference.
use super::super::{PreparedPhysicalRoomRecoveryHost, VerifiedPhysicalServerRecoveryAssets};
use super::PhysicalRoomRecoveryControlIdentity;
use crate::{
    Error, Result,
    server::{Authentication, ServerRecoveryAssetProvider},
};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tokio::sync::Semaphore;

pub(super) struct State {
    pub host: PreparedPhysicalRoomRecoveryHost,
    pub proof: Arc<VerifiedPhysicalServerRecoveryAssets>,
    pub provider: Arc<dyn ServerRecoveryAssetProvider>,
    pub owner: String,
    // Same digest as the actual native account config, never a retained plaintext bearer token.
    // Server-private only; no endpoint or portable record accepts a digest as authentication.
    pub native_token_digest: [u8; 32],
    pub operators: Authentication,
    pub selection: PhysicalRoomRecoveryControlIdentity,
    pub live: AtomicBool,
    pub requests: Arc<Semaphore>,
}
impl State {
    pub fn local(&self) -> Result<()> {
        if self.live.load(Ordering::Acquire) { Ok(()) } else { Err(Error::NeedsRecovery) }
    }
    pub async fn check(&self) -> Result<()> {
        self.local()?;
        self.proof
            .check_live_digest(
                &self.host,
                &self.owner,
                &self.native_token_digest,
                self.provider.clone(),
            )
            .await?;
        self.local()
    }
}

/// Explicit live read-only operator owner. Keep private to the host's control-service lifetime.
/// The router alone holds no host/provider lease. Closing/dropping this guard refuses new and
/// in-flight checks; an already-running native worker retains its actual owners until it ends.
/// No native file, role, writer, router for editing, or activation marker is created.
/// ```compile_fail
/// use breditor_collab_relay::server::PhysicalRoomRecoveryControl;
/// let _: PhysicalRoomRecoveryControl = Default::default();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::PhysicalRoomRecoveryControl;
/// let _: PhysicalRoomRecoveryControl = serde_json::from_str("{}").unwrap();
/// ```
pub struct PhysicalRoomRecoveryControl {
    pub(super) state: Arc<State>,
}
impl PhysicalRoomRecoveryControl {
    /// Detached independently selected control instance and A/B/C cut, never account authority.
    #[must_use]
    pub fn identity(&self) -> PhysicalRoomRecoveryControlIdentity {
        self.state.selection.clone()
    }
    /// Stop operator checks without deleting data or dropping an in-flight worker's native lease.
    pub fn close(&self) {
        self.state.live.store(false, Ordering::Release);
    }
}
impl Drop for PhysicalRoomRecoveryControl {
    fn drop(&mut self) {
        self.close();
    }
}
