//! Runtime-only proof over the same actual host and a complete retained previous archive.
use super::{ServerLogGenerationDeliveryContinuationIdentity, selected::check_selected};
use crate::server::generation_recovery::{
    PreparedLogGenerationRecoveryHost, VerifiedServerLogGenerationRecoveryState,
};
use crate::{Error, Result, ServerLogGenerationRoomBackup};
use std::sync::Arc;

/// Genuine current protected-stream proof plus complete A <= B <= C byte ancestry.
/// No strong native host/lease is retained and no router, client receipt, writer
/// grant or whole-room activation capability is returned. Recheck before use.
///
/// The proof cannot be created from matching metadata or a saved ready marker.
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerLogGenerationDeliveryContinuation;
/// let _: VerifiedServerLogGenerationDeliveryContinuation = Default::default();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerLogGenerationDeliveryContinuation;
/// let _: VerifiedServerLogGenerationDeliveryContinuation = serde_json::from_str("{}").unwrap();
/// ```
pub struct VerifiedServerLogGenerationDeliveryContinuation {
    pub(super) identity: ServerLogGenerationDeliveryContinuationIdentity,
    pub(super) current: Arc<VerifiedServerLogGenerationRecoveryState>,
    pub(super) previous: Arc<ServerLogGenerationRoomBackup>,
}
impl VerifiedServerLogGenerationDeliveryContinuation {
    /// Detached exact pins only. They do not recreate this runtime capability.
    #[must_use]
    pub fn identity(&self) -> ServerLogGenerationDeliveryContinuationIdentity {
        self.identity.clone()
    }
    /// Freshly authenticate and recheck the same live host, all current protected
    /// registrations, both full physical/raster ancestry links and current custody.
    /// New native records, registrations, ACLs, rotations or rasters stale the proof.
    /// # Errors
    /// Wrong/dead/different host, authentication/owner, changed cuts, lost original
    /// bytes/rasters or uncertain actual storage refuse. Never grants later mutation.
    pub async fn check_live(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
        token: &str,
    ) -> Result<()> {
        handle.host.authentication.authenticate(principal, token)?;
        self.check_current(handle, principal).await
    }
    pub(in crate::server) async fn check_live_digest(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
        digest: &[u8; 32],
    ) -> Result<()> {
        handle.host.authentication.authenticate_digest(principal, digest)?;
        self.check_current(handle, principal).await
    }
    async fn check_current(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
    ) -> Result<()> {
        self.current.check_host(handle, principal)?;
        let assets =
            handle.host.assets.clone().ok_or(Error::Contract("delivery rasters absent"))?;
        let custody = handle
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("delivery custody absent"))?;
        let original = handle.original.clone();
        let previous = self.previous.clone();
        let expected = self.identity.clone();
        let owner = principal.to_owned();
        handle
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(room, &mut assets, &original, &previous, &custody, &owner, &expected)
            })
            .await
    }
}
