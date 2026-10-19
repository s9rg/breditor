//! Join genuine original/current credential continuity and actual current server byte availability.
use super::super::{
    ServerBackupHandle, ServerRecoveryContinuationIdentity, VerifiedServerRecoveryContinuation,
};
use super::{
    ServerAssetAvailabilityCoverage, ServerAssetAvailabilityMissing, ServerAssetAvailabilityRead,
    ServerAssetRecoveryState, ServerRecoveryAssetProvider, VerifiedServerAssetAvailability,
};
use crate::Result;
use std::sync::Arc;

/// Server recovery assets are verified only after genuine native continuity and provider checks.
/// Client/offline/extension stores and cross-device/global activation remain separate requirements.
pub enum ServerRecoveryAssetCoverage {
    /// Both genuine live proofs share the same exact current native cut and host.
    Verified(VerifiedServerRecoveryAssets),
    /// Preserve the original recovery proof and resolve the missing native sources/mappings/bytes.
    /// No partially usable combined proof is returned.
    Pending {
        /// Actual current native cut and complete server dependency outcome.
        state: Box<ServerAssetRecoveryState>,
        /// Missing mapping/payload records; native packet Pending stays in state.references.
        missing: Vec<ServerAssetAvailabilityMissing>,
    },
}
/// Genuine server-only original/current registration continuity and current provider bytes.
/// Neither metadata nor a successful Boolean can construct this value. Native/provider references
/// remain weak; keeping this proof alone retains no stopped server or mapping guard.
/// It neither grants browser activation nor reserves a later server mutation.
///
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerRecoveryAssets;
/// let _: VerifiedServerRecoveryAssets = serde_json::from_str("{}").unwrap();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerRecoveryAssets;
/// let _: VerifiedServerRecoveryAssets = Default::default();
/// ```
pub struct VerifiedServerRecoveryAssets {
    continuation: Arc<VerifiedServerRecoveryContinuation>,
    availability: VerifiedServerAssetAvailability,
}
impl ServerBackupHandle {
    /// Reauthenticate/recheck a genuine host-local original/current continuity proof, then admit
    /// actual server dependency bytes against that same exact current cut and provider guard.
    /// The second native transaction refuses any intervening log/raster/registration change;
    /// it cannot silently choose a later cut or reuse a proof belonging to another native host.
    /// Missing provider data yields Pending without consuming native owners or changing files.
    /// Keep caller-owned continuation/provider guards for retries and later live rechecks.
    /// This proves server scope only, not every client/offline copy, external extension or a final
    /// activation barrier. Protected credential storage and deployment fencing remain host-owned.
    /// # Errors
    /// Rejects wrong current owner/authentication, foreign/stale continuity proofs, invalid native
    /// dependencies or mappings, corrupt files and existing complete-read/admission budgets.
    pub async fn verify_recovery_asset_availability(
        &self,
        principal: &str,
        token: &str,
        continuation: Arc<VerifiedServerRecoveryContinuation>,
        provider: Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<ServerRecoveryAssetCoverage> {
        continuation.check_live(self, principal, token).await?;
        let expected = continuation.identity().current;
        Ok(
            match self
                .verify_server_asset_availability(principal, token, expected, provider)
                .await?
            {
                ServerAssetAvailabilityCoverage::Verified(availability) => {
                    ServerRecoveryAssetCoverage::Verified(VerifiedServerRecoveryAssets {
                        continuation,
                        availability,
                    })
                }
                ServerAssetAvailabilityCoverage::Pending { state, missing } => {
                    ServerRecoveryAssetCoverage::Pending { state, missing }
                }
            },
        )
    }
}
impl VerifiedServerRecoveryAssets {
    /// Detached independently selected original/current identities, never another live proof.
    #[must_use]
    pub fn identity(&self) -> ServerRecoveryContinuationIdentity {
        self.continuation.identity()
    }
    /// Borrowed original-pair/current-content metadata, not upload, collection or activation rights.
    #[must_use]
    pub fn metadata(&self) -> &ServerAssetAvailabilityRead {
        self.availability.metadata()
    }
    /// Reauthenticate and recheck both genuine proofs on the same current host/provider guards.
    /// Both checks require their identical complete native cut; changed state needs a fresh cut,
    /// protected registration verification and byte availability check, not an updated Boolean.
    /// # Errors
    /// Rejects expired/different/unauthorized owners or guards, changed native files/registrations,
    /// missing bytes, changed opaque mappings and original or complete-result read limits.
    pub async fn check_live(
        &self,
        handle: &ServerBackupHandle,
        principal: &str,
        token: &str,
        provider: Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<()> {
        self.continuation.check_live(handle, principal, token).await?;
        self.availability.check_live(handle, principal, token, provider).await
    }
}
