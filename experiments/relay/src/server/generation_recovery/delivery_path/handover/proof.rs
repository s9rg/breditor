//! Recheck the actual sealed origin and the same live successor.
use super::super::VerifiedServerLogGenerationDeliveryPath;
use super::ServerLogGenerationHandoverDeliveryPathIdentity;
use crate::{
    Error, Result,
    server::{
        LogGenerationHandoverStatus, PreparedLogGenerationHandover,
        PreparedLogGenerationRecoveryHost, RoomDeploymentAuthority,
    },
};
use std::sync::Arc;

/// Native proof of an ordered complete archive path across a sealed restore.
/// It grants no writer, serving permission, provider closure or acknowledgement.
/// A new host must verify the actual cut and retained source again.
pub struct VerifiedServerLogGenerationHandoverDeliveryPath {
    pub(super) identity: ServerLogGenerationHandoverDeliveryPathIdentity,
    pub(super) handover: Arc<PreparedLogGenerationHandover>,
    pub(super) authority: RoomDeploymentAuthority,
    pub(in crate::server::generation_recovery) successor:
        Arc<VerifiedServerLogGenerationDeliveryPath>,
}

impl VerifiedServerLogGenerationHandoverDeliveryPath {
    /// Detached evidence for a trusted host. It supplies no runtime proof.
    #[must_use]
    pub fn identity(&self) -> ServerLogGenerationHandoverDeliveryPathIdentity {
        self.identity.clone()
    }

    /// Reauthenticate, recheck the actual retained seal and verify the successor's
    /// original custody, live native/raster cut and protected registrations.
    ///
    /// # Errors
    /// Wrong owner or successor, changed seal custody, uncertain ledger, stale
    /// native/raster cut or lost operational custody refuse.
    pub async fn check_live(
        &self,
        host: &PreparedLogGenerationRecoveryHost,
        principal: &str,
        token: &str,
    ) -> Result<()> {
        host.host.authentication.authenticate(principal, token)?;
        self.check_seal(host, principal).await?;
        self.successor.check_live(host, principal, token).await
    }

    pub(in crate::server::generation_recovery) async fn check_live_digest(
        &self,
        host: &PreparedLogGenerationRecoveryHost,
        principal: &str,
        digest: &[u8; 32],
    ) -> Result<()> {
        host.host.authentication.authenticate_digest(principal, digest)?;
        self.check_seal(host, principal).await?;
        self.successor.check_live_digest(host, principal, digest).await
    }

    async fn check_seal(
        &self,
        host: &PreparedLogGenerationRecoveryHost,
        principal: &str,
    ) -> Result<()> {
        self.successor.current.check_host(host, principal)?;
        let handover = self.handover.clone();
        let authority = self.authority.clone();
        tokio::task::spawn_blocking(move || {
            if handover.status(&authority)? != LogGenerationHandoverStatus::Sealed {
                return Err(Error::Contract("delivery handover seal is absent"));
            }
            Ok(())
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
