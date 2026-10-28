//! Weak native/provider identities and an immutable bounded read; never an activation reservation.
use super::super::{
    PreparedLogGenerationRecoveryHost, ServerLogGenerationRecoveryStateIdentity,
    VerifiedServerLogGenerationRecoveryState,
};
use super::{
    ServerLogGenerationAssetAvailabilityRead,
    check::{Checked, Selected, check},
};
use crate::{Error, Result, server::ServerRecoveryAssetProvider};
use std::sync::{Arc, Weak};

/// Genuine same-host origin/current continuity plus actual server-scope provider-backed image bytes.
/// Holds no strong native host/provider, secret or writer lease. Detached metadata cannot create it.
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerLogGenerationRecoveryAssets;
/// let _: VerifiedServerLogGenerationRecoveryAssets = serde_json::from_str("{}").unwrap();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerLogGenerationRecoveryAssets;
/// let _: VerifiedServerLogGenerationRecoveryAssets = Default::default();
/// ```
pub struct VerifiedServerLogGenerationRecoveryAssets {
    pub(super) continuation: Arc<VerifiedServerLogGenerationRecoveryState>,
    pub(super) provider: Weak<dyn ServerRecoveryAssetProvider>,
    pub(super) read: Arc<ServerLogGenerationAssetAvailabilityRead>,
}
impl VerifiedServerLogGenerationRecoveryAssets {
    /// Detached origin/current selections, not another native/provider/activation capability.
    #[must_use]
    pub fn identity(&self) -> ServerLogGenerationRecoveryStateIdentity {
        self.continuation.identity()
    }
    /// Borrowed complete byte-resolution metadata; cloning it creates no live proof.
    #[must_use]
    pub fn metadata(&self) -> &ServerLogGenerationAssetAvailabilityRead {
        &self.read
    }
    /// Reauthenticate actual native continuity and this same still-live provider guard, then
    /// re-admit all current dependencies, byte metadata and mappings at the exact selected cut.
    /// Client/outbox closure, deployment fencing and later atomic activation remain separate.
    /// # Errors
    /// Different/dead host/provider, wrong owner/authentication, changed origin/current or mapping epoch,
    /// missing/changed bytes, uncertain custody or existing complete-result limits refuse.
    pub async fn check_live(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
        token: &str,
        provider: Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<()> {
        self.continuation.check_live(handle, principal, token).await?;
        self.check_current(handle, principal, provider).await
    }
    async fn check_current(
        &self,
        handle: &PreparedLogGenerationRecoveryHost,
        principal: &str,
        provider: Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<()> {
        if !self.provider.upgrade().is_some_and(|held| Arc::ptr_eq(&held, &provider)) {
            return Err(Error::Contract("generation asset provider owner differs"));
        }
        let expected = self.read.state.current.clone();
        let before = self.read.clone();
        let original = handle.original.clone();
        let custody = handle
            .host
            .generation_custody
            .clone()
            .ok_or(Error::Contract("generation host actual local custody absent"))?;
        let assets = handle
            .host
            .assets
            .clone()
            .ok_or(Error::Contract("generation host actual rasters absent"))?;
        let owner = principal.to_owned();
        handle
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                match check(
                    room,
                    &mut assets,
                    &Selected {
                        original: &original,
                        custody: &custody,
                        owner: &owner,
                        expected: &expected,
                    },
                    provider.as_ref(),
                )? {
                    Checked::Ready(actual) if actual.as_ref() == before.as_ref() => Ok(()),
                    _ => Err(Error::Contract("generation asset verification no longer current")),
                }
            })
            .await
    }
}
