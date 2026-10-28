//! Genuine protected-stream continuity precedes actual generation server byte availability.
use super::super::{
    PreparedLogGenerationRecoveryHost, ServerLogGenerationAssetRecoveryState,
    VerifiedServerLogGenerationRecoveryState,
};
use super::{
    VerifiedServerLogGenerationRecoveryAssets,
    check::{Checked, Selected, check},
};
use crate::{
    Error, Result,
    server::{ServerAssetAvailabilityMissing, ServerRecoveryAssetProvider},
};
use std::sync::Arc;

/// Server-scope availability only; missing native sources, mappings or bytes create no proof.
pub enum ServerLogGenerationRecoveryAssetCoverage {
    /// Genuine same-host origin/current credential continuity and actual current provider-backed rasters.
    Verified(VerifiedServerLogGenerationRecoveryAssets),
    /// Retain all native/client/provider owners and resolve these explicit missing requirements.
    Pending {
        /// Exact selected origin/current state, including whole native Ready/Pending dependencies.
        state: Box<ServerLogGenerationAssetRecoveryState>,
        /// Unavailable current mappings or bytes; native Pending stays in state.references.
        missing: Vec<ServerAssetAvailabilityMissing>,
    },
}
impl PreparedLogGenerationRecoveryHost {
    /// Join a genuine same-host protected-stream proof with actual current native raster bytes
    /// and a checked provider guard, without rewriting opaque pairs or choosing a newer cut.
    /// The second native transaction rechecks the exact complete origin/current identity before and after
    /// callbacks. No remote fetch, client flush, file, role, lease, router or activation changes.
    /// Keep the supplied native proof and provider guard alive for later checks.
    /// # Errors
    /// Wrong current owner/authentication, foreign/stale native proof, lost custody, changed
    /// source, bad provider mappings, corrupt rasters or complete encoded-result overflow refuse.
    pub async fn verify_recovery_asset_availability(
        &self,
        principal: &str,
        token: &str,
        continuation: Arc<VerifiedServerLogGenerationRecoveryState>,
        provider: Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<ServerLogGenerationRecoveryAssetCoverage> {
        continuation.check_live(self, principal, token).await?;
        let expected = continuation.identity();
        let original = self.original.clone();
        let custody = self
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("generation host actual local custody absent"))?;
        let assets = self
            .host
            .assets
            .clone()
            .ok_or(Error::Contract("generation host actual rasters absent"))?;
        let owner = principal.to_owned();
        let supplied = provider.clone();
        let result = self
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check(
                    room,
                    &mut assets,
                    &Selected {
                        original: &original,
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
                ServerLogGenerationRecoveryAssetCoverage::Pending { state, missing }
            }
            Checked::Ready(read) => ServerLogGenerationRecoveryAssetCoverage::Verified(
                VerifiedServerLogGenerationRecoveryAssets {
                    continuation,
                    provider: Arc::downgrade(&provider),
                    read,
                },
            ),
        })
    }
}
