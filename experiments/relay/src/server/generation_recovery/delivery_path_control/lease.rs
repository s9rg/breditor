//! One actual nested owner and request quota; idle routers retain only weak references.
use super::super::{
    ServerLogGenerationDeliveryRecoveryControl, VerifiedServerLogGenerationDeliveryPath,
};
use super::ServerLogGenerationDeliveryPathRecoveryControlIdentity;
use super::handover::{Handover, ServerLogGenerationHandoverDeliveryPathRecoveryControlIdentity};
use crate::{Error, Result};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
pub(super) struct State {
    pub current: ServerLogGenerationDeliveryRecoveryControl,
    pub path: Arc<VerifiedServerLogGenerationDeliveryPath>,
    pub selection: ServerLogGenerationDeliveryPathRecoveryControlIdentity,
    pub handover: Option<Handover>,
    pub live: AtomicBool,
}
impl State {
    pub fn local(&self) -> Result<()> {
        if !self.live.load(Ordering::Acquire) {
            return Err(Error::NeedsRecovery);
        }
        self.current.state.local()
    }
    async fn check_path(&self, handover: bool) -> Result<()> {
        let native = &self.current.state.current.state;
        if handover {
            return self
                .handover
                .as_ref()
                .ok_or(Error::NeedsRecovery)?
                .proof
                .check_live_digest(&native.host, &native.owner, &native.native_token_digest)
                .await;
        }
        self.path.check_live_digest(&native.host, &native.owner, &native.native_token_digest).await
    }
    pub async fn check(&self, handover: bool) -> Result<()> {
        self.local()?;
        self.check_path(handover).await?;
        self.current.state.check().await?;
        // Actual provider callbacks may not stale even an intermediate/native/raster selection.
        self.check_path(handover).await?;
        self.local()
    }
}
/// Explicit owner of the genuine complete native path and unchanged prior/current
/// operator controls. Close/drop refuses all shared read routes, not editors.
/// Actual in-flight native work retains custody until it really finishes.
/// No public constructor, saved-ready admission, ACK, import or activation.
/// ```compile_fail
/// use breditor_collab_relay::server::ServerLogGenerationDeliveryPathRecoveryControl;
/// let _:ServerLogGenerationDeliveryPathRecoveryControl=Default::default();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::ServerLogGenerationDeliveryPathRecoveryControl;
/// let _:ServerLogGenerationDeliveryPathRecoveryControl=serde_json::from_str("{}").unwrap();
/// ```
pub struct ServerLogGenerationDeliveryPathRecoveryControl {
    pub(super) state: Arc<State>,
}
impl ServerLogGenerationDeliveryPathRecoveryControl {
    /// Detached data pins only; they do not recreate this actual owner.
    #[must_use]
    pub fn identity(&self) -> ServerLogGenerationDeliveryPathRecoveryControlIdentity {
        self.state.selection.clone()
    }
    /// Detached handover selection when the host explicitly provisioned this read.
    #[must_use]
    pub fn handover_identity(
        &self,
    ) -> Option<ServerLogGenerationHandoverDeliveryPathRecoveryControlIdentity> {
        self.state.handover.as_ref().map(|handover| handover.selection.clone())
    }
    /// Stop new/in-flight operator checks without editing data or prematurely releasing native work.
    pub fn close(&self) {
        self.state.live.store(false, Ordering::Release);
        self.state.current.close();
    }
}
impl Drop for ServerLogGenerationDeliveryPathRecoveryControl {
    fn drop(&mut self) {
        self.close();
    }
}
