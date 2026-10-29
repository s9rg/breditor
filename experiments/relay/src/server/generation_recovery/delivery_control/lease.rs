//! One actual operator owner, shared native/provider request quota, weak-only routers.
use super::super::{
    ServerLogGenerationRecoveryControl, VerifiedServerLogGenerationDeliveryContinuation,
};
use super::ServerLogGenerationDeliveryRecoveryControlIdentity;
use crate::{Error, Result};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

pub(super) struct State {
    pub current: ServerLogGenerationRecoveryControl,
    pub continuation: Arc<VerifiedServerLogGenerationDeliveryContinuation>,
    pub selection: ServerLogGenerationDeliveryRecoveryControlIdentity,
    pub live: AtomicBool,
}
impl State {
    pub fn local(&self) -> Result<()> {
        if !self.live.load(Ordering::Acquire) {
            return Err(Error::NeedsRecovery);
        }
        self.current.state.local()
    }
    pub async fn check(&self) -> Result<()> {
        self.local()?;
        let current = &self.current.state;
        self.continuation
            .check_live_digest(&current.host, &current.owner, &current.native_token_digest)
            .await?;
        current.check().await?;
        // Provider callbacks must not change the native/raster cut before return.
        self.continuation
            .check_live_digest(&current.host, &current.owner, &current.native_token_digest)
            .await?;
        self.local()
    }
}
/// Explicit owner of the genuine current control and previous-cut proof. Dropping
/// this guard closes ALL its shared operator routes, not the editing service.
/// In-flight native workers retain their real owners until they actually finish.
/// No source, receipt, role, registration or activation is changed.
/// ```compile_fail
/// use breditor_collab_relay::server::ServerLogGenerationDeliveryRecoveryControl;
/// let _: ServerLogGenerationDeliveryRecoveryControl = Default::default();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::ServerLogGenerationDeliveryRecoveryControl;
/// let _: ServerLogGenerationDeliveryRecoveryControl = serde_json::from_str("{}").unwrap();
/// ```
pub struct ServerLogGenerationDeliveryRecoveryControl {
    pub(super) state: Arc<State>,
}
impl ServerLogGenerationDeliveryRecoveryControl {
    /// Detached exact pins, not an executable or portable grant.
    #[must_use]
    pub fn identity(&self) -> ServerLogGenerationDeliveryRecoveryControlIdentity {
        self.state.selection.clone()
    }
    /// Refuse new and in-flight operator reads without stopping editors or deleting data.
    pub fn close(&self) {
        self.state.live.store(false, Ordering::Release);
        self.state.current.close();
    }
}
impl Drop for ServerLogGenerationDeliveryRecoveryControl {
    fn drop(&mut self) {
        self.close();
    }
}
