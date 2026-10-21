//! Genuine protected-stream continuity precedes actual physical server byte availability.
use super::super::{
    PhysicalServerAssetRecoveryState, PreparedPhysicalRoomRecoveryHost,
    VerifiedPhysicalServerRoomRecoveryState,
};
use super::{
    VerifiedPhysicalServerRecoveryAssets,
    check::{Checked, Selected, check},
};
use crate::{
    Error, Result,
    server::{ServerAssetAvailabilityMissing, ServerRecoveryAssetProvider},
};
use std::sync::Arc;

/// Server-scope availability only; missing native sources, mappings or bytes create no proof.
pub enum PhysicalServerRecoveryAssetCoverage {
    /// Genuine same-host A/B/C credential continuity and actual current provider-backed rasters.
    Verified(VerifiedPhysicalServerRecoveryAssets),
    /// Retain all native/client/provider owners and resolve these explicit missing requirements.
    Pending {
        /// Exact selected A/B/C state, including whole native Ready/Pending dependencies.
        state: Box<PhysicalServerAssetRecoveryState>,
        /// Unavailable current mappings or bytes; native Pending stays in state.references.
        missing: Vec<ServerAssetAvailabilityMissing>,
    },
}
impl PreparedPhysicalRoomRecoveryHost {
    /// Join a genuine same-host protected-stream proof with actual current native raster bytes
    /// and a checked provider guard, without rewriting opaque pairs or choosing a newer cut.
    /// The second native transaction rechecks the exact complete A/B/C identity before and after
    /// callbacks. No remote fetch, client flush, file, role, lease, router or activation changes.
    /// Keep the supplied native proof and provider guard alive for later checks.
    /// # Errors
    /// Wrong current owner/authentication, foreign/stale native proof, lost custody, changed
    /// source, bad provider mappings, corrupt rasters or complete encoded-result overflow refuse.
    pub async fn verify_recovery_asset_availability(
        &self,
        principal: &str,
        token: &str,
        continuation: Arc<VerifiedPhysicalServerRoomRecoveryState>,
        provider: Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<PhysicalServerRecoveryAssetCoverage> {
        continuation.check_live(self, principal, token).await?;
        let expected = continuation.identity();
        let original = self.local.original.clone();
        let ancestor = self.ancestor.clone();
        let custody = self
            .local
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("physical host actual local custody absent"))?;
        let assets = self
            .local
            .host
            .assets
            .clone()
            .ok_or(Error::Contract("physical host actual rasters absent"))?;
        let owner = principal.to_owned();
        let supplied = provider.clone();
        let result = self
            .local
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check(
                    room,
                    &mut assets,
                    &Selected {
                        original: &original,
                        ancestor: &ancestor,
                        custody: &custody,
                        owner: &owner,
                        expected: &expected,
                    },
                    supplied.as_ref(),
                )
            })
            .await?;
        Ok(match result {
            Checked::Pending(state, missing) => {
                PhysicalServerRecoveryAssetCoverage::Pending { state, missing }
            }
            Checked::Ready(read) => PhysicalServerRecoveryAssetCoverage::Verified(
                VerifiedPhysicalServerRecoveryAssets {
                    continuation,
                    provider: Arc::downgrade(&provider),
                    read,
                },
            ),
        })
    }
}
