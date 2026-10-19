//! Live native/provider proof with weak identity bindings, never global room activation authority.
use super::super::{
    ServerBackupHandle, ServerRecoveryStateIdentity, recovery_check::check_selected,
};
use super::{
    ServerAssetAvailabilityMissing, ServerAssetAvailabilityRead, ServerAssetRecoveryState,
    ServerRecoveryAssetProvider, capture, resolve,
};
use crate::{Error, Result, Room, ServerAssetReferenceOutcome, assets::AssetStore};
use std::sync::{Arc, Mutex, Weak};

/// Whole actual server dependency availability, not a claim over client/offline/extension sources.
pub enum ServerAssetAvailabilityCoverage {
    /// Exact native current files and all native server requirements have actual decoded bytes
    /// and current host mappings. Recheck before use; no later activation barrier is reserved.
    Verified(VerifiedServerAssetAvailability),
    /// No partially usable proof. Native packet Pending is in state.references.outcome.
    Pending {
        /// Exact actual native current files and complete server dependency result.
        state: Box<ServerAssetRecoveryState>,
        /// Every unavailable current mapping/payload, only when native references are complete.
        missing: Vec<ServerAssetAvailabilityMissing>,
    },
}

/// Actual native byte availability on this one current host and this exact checked provider guard.
/// Contains no secret, writer lease or strong host/provider reference. Metadata cannot forge it.
///
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerAssetAvailability;
/// let _: VerifiedServerAssetAvailability = serde_json::from_str("{}").unwrap();
/// ```
/// ```compile_fail
/// use breditor_collab_relay::server::VerifiedServerAssetAvailability;
/// let _: VerifiedServerAssetAvailability = Default::default();
/// ```
pub struct VerifiedServerAssetAvailability {
    read: Box<ServerAssetAvailabilityRead>,
    owner: String,
    room: Weak<Mutex<Room>>,
    provider: Weak<dyn ServerRecoveryAssetProvider>,
}
enum Checked {
    Ready(Box<ServerAssetAvailabilityRead>),
    Pending(Box<ServerAssetRecoveryState>, Vec<ServerAssetAvailabilityMissing>),
}
fn check(
    room: &mut Room,
    assets: &mut AssetStore,
    owner: &str,
    expected: &ServerRecoveryStateIdentity,
    provider: &dyn ServerRecoveryAssetProvider,
) -> Result<Checked> {
    check_selected(room, assets, owner, expected)?;
    resolve::guard(provider)?;
    let state = capture::state(room, assets, owner)?;
    if state.current != *expected {
        return Err(Error::Contract("server asset selected cut changed"));
    }
    let ServerAssetReferenceOutcome::Ready { references } = &state.references.outcome else {
        super::read_budget::pending(&state, &[])?;
        resolve::guard(provider)?;
        return Ok(Checked::Pending(Box::new(state), Vec::new()));
    };
    let resolved = resolve::resolve(assets, references, provider)?;
    check_selected(room, assets, owner, expected)?;
    resolve::guard(provider)?;
    if !resolved.missing.is_empty() {
        super::read_budget::pending(&state, &resolved.missing)?;
        return Ok(Checked::Pending(Box::new(state), resolved.missing));
    }
    let read = ServerAssetAvailabilityRead {
        state,
        resolutions: resolved.resolutions,
        assets: resolved.assets,
    };
    super::read_budget::check(&read)?;
    resolve::guard(provider)?;
    Ok(Checked::Ready(Box::new(read)))
}
impl ServerBackupHandle {
    /// Verify all actual native server references against this room's complete raster store and
    /// an explicit currently checked host mapping guard. Direct SHA-256 IDs cannot be remapped.
    /// Opaque IDs require mappings; all original binding generations retain one immutable digest.
    /// Native history/packet Pending, missing mapping or absent bytes produce no live proof.
    /// Host mappings run synchronously under room/assets locks; acquire remote authority first.
    /// Client/offline stores, original registration secrets, deployment fencing, original-history
    /// continuity and an atomic final activation barrier remain separate required checks.
    /// # Errors
    /// Rejects wrong current owner authentication/selection, bad/stale/unauthorized mappings,
    /// unknown native dependency forms, corrupt files and original or separate complete-read bounds.
    pub async fn verify_server_asset_availability(
        &self,
        principal: &str,
        token: &str,
        expected: ServerRecoveryStateIdentity,
        provider: Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<ServerAssetAvailabilityCoverage> {
        self.host.authentication.authenticate(principal, token)?;
        let assets =
            self.host.assets.clone().ok_or(Error::Contract("server recovery assets absent"))?;
        let owner = principal.to_owned();
        let selected = expected;
        let supplied = provider.clone();
        let result = self
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check(room, &mut assets, &owner, &selected, supplied.as_ref())
            })
            .await?;
        Ok(match result {
            Checked::Pending(state, missing) => {
                ServerAssetAvailabilityCoverage::Pending { state, missing }
            }
            Checked::Ready(read) => {
                ServerAssetAvailabilityCoverage::Verified(VerifiedServerAssetAvailability {
                    read,
                    owner: principal.into(),
                    room: Arc::downgrade(&self.host.room),
                    provider: Arc::downgrade(&provider),
                })
            }
        })
    }
}
impl VerifiedServerAssetAvailability {
    /// Borrowed complete detached metadata; copying it creates no native/provider proof.
    #[must_use]
    pub fn metadata(&self) -> &ServerAssetAvailabilityRead {
        &self.read
    }
    /// Authenticate again and re-admit the exact current native cut, complete dependencies,
    /// actual byte metadata and every mapping under the same still-live host/provider identities.
    /// This is a check at one instant, not a reservation for later mutation or global activation.
    /// # Errors
    /// Rejects different/closed host/provider guards, wrong owner/authentication, changed files,
    /// unavailable bytes, changed mappings or original native/complete-read budgets.
    pub async fn check_live(
        &self,
        handle: &ServerBackupHandle,
        principal: &str,
        token: &str,
        provider: Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<()> {
        handle.host.authentication.authenticate(principal, token)?;
        if principal != self.owner {
            return Err(Error::Permission);
        }
        if !self.room.upgrade().is_some_and(|r| Arc::ptr_eq(&r, &handle.host.room))
            || !self.provider.upgrade().is_some_and(|p| Arc::ptr_eq(&p, &provider))
        {
            return Err(Error::Contract("server asset verification owner differs"));
        }
        let expected = self.read.state.current.clone();
        let owner = self.owner.clone();
        let before = self.read.clone();
        let assets =
            handle.host.assets.clone().ok_or(Error::Contract("server recovery assets absent"))?;
        handle
            .host
            .transaction(move |room| {
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                match check(room, &mut assets, &owner, &expected, provider.as_ref())? {
                    Checked::Ready(actual) if actual == before => Ok(()),
                    _ => Err(Error::Contract("server asset verification no longer current")),
                }
            })
            .await
    }
}
