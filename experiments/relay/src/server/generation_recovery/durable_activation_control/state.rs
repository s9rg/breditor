//! Reachable actual service custody is separate from a serializable receipt.
use super::DurableNativeActivationControlIdentity;
use crate::{
    Error, Result,
    server::{
        ActivatedNativeLogGenerationHost, Authentication, PreparedLogGenerationRecoveryHost,
        PreparedNativeGenerationActivation, RoomDeploymentAuthority,
        VerifiedServerLogGenerationRecoveryState,
    },
};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use tokio::sync::Semaphore;

pub(super) enum Commit {
    Prepared,
    // A started commit may append durably before returning an error. Never reset.
    Uncertain,
    Active(Box<ActivatedNativeLogGenerationHost>),
}
pub(super) struct State {
    pub host: PreparedLogGenerationRecoveryHost,
    pub proof: Arc<VerifiedServerLogGenerationRecoveryState>,
    pub prepared: Arc<PreparedNativeGenerationActivation>,
    pub authority: RoomDeploymentAuthority,
    pub owner: String,
    pub native_token_digest: [u8; 32],
    pub operators: Authentication,
    pub selection: DurableNativeActivationControlIdentity,
    pub live: AtomicBool,
    pub requests: Arc<Semaphore>,
    pub commit: Mutex<Commit>,
}
impl State {
    pub fn local(&self) -> Result<()> {
        if self.live.load(Ordering::Acquire) { Ok(()) } else { Err(Error::NeedsRecovery) }
    }
}

/// Host-owned one-shot activation control. Routers hold only weak references.
/// A started worker keeps actual owners and its quota until it settles, even
/// when the HTTP waiter disappears. An uncertain attempt needs explicit cold
/// recovery; no receipt can reconstruct a serving lease.
/// ```compile_fail
/// use breditor_collab_relay::server::DurableNativeActivationControl;
/// let _: DurableNativeActivationControl = serde_json::from_str("{}").unwrap();
/// ```
pub struct DurableNativeActivationControl {
    pub(super) state: Arc<State>,
}
impl DurableNativeActivationControl {
    /// Detached instance/checkpoint choice. This never invokes activation.
    #[must_use]
    pub fn identity(&self) -> DurableNativeActivationControlIdentity {
        self.state.selection.clone()
    }
    /// Obtain routes from the actual retained successful service, including
    /// after a lost response. Never reconstructs a lease from checkpoint status.
    /// Does not bind sockets or certify client/provider readiness.
    /// # Errors
    /// Closed, busy, unstarted, uncertain or superseded service custody refuses.
    pub async fn service_router(&self) -> Result<axum::Router> {
        self.state.local()?;
        let state = self.state.clone();
        tokio::task::spawn_blocking(move || state.service_router())
            .await
            .map_err(|_| Error::NeedsRecovery)?
    }
    /// Stop this operator control. Does not revoke an already activated native
    /// service, delete files or cancel an actual worker already committing.
    pub fn close(&self) {
        self.state.live.store(false, Ordering::Release);
    }
}
impl State {
    /// Trusted Rust composition only: install the actual normal service while
    /// its real Native deployment transaction still holds the current lease.
    pub(super) fn with_serving_router<T>(
        &self,
        connections: Arc<crate::server::publication_connections::Connections>,
        visit: impl FnOnce(axum::Router) -> Result<T>,
    ) -> Result<T> {
        self.local()?;
        let held = self.commit.try_lock().map_err(|_| Error::Locked)?;
        let Commit::Active(active) = &*held else {
            return Err(Error::NeedsRecovery);
        };
        self.prepared.guard()?;
        active.recovery_host().host.deployment.transaction(|| {
            self.local()?;
            let mut host = active.recovery_host().host;
            host.publication_connections = Some(connections);
            visit(crate::server::routes(host))
        })
    }
    fn service_router(&self) -> Result<axum::Router> {
        self.local()?;
        let held = self.commit.try_lock().map_err(|_| Error::Locked)?;
        let Commit::Active(active) = &*held else {
            return Err(Error::NeedsRecovery);
        };
        self.prepared.guard()?;
        active.recovery_host().host.deployment.transaction(|| Ok(()))?;
        self.local()?;
        Ok(active.router())
    }
}

impl Drop for DurableNativeActivationControl {
    fn drop(&mut self) {
        self.close();
    }
}
