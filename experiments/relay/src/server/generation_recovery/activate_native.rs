//! Explicit native service activation, not an automatic client/provider handoff.
use super::{
    NativeLogGenerationActivationIdentity, PreparedLogGenerationRecoveryHost,
    VerifiedServerLogGenerationRecoveryState,
};
use crate::{
    Error, Result,
    server::{
        PreparedLogGenerationHandover, RoomDeploymentAuthority, RoomDeploymentSelection,
        deployment_fence, generation_backup::durable::Interruption,
    },
};
use axum::Router;
use std::sync::Arc;

/// Shared actual custody survives every earlier host clone and detached worker.
/// These are original owners, never recreated Room/AssetStore parts.
pub(in crate::server) struct NativeGenerationServingCustody {
    pub original: Arc<crate::room::HostOrigin>,
    pub source: Arc<PreparedLogGenerationHandover>,
    pub checkpoint: Option<Arc<super::PreparedNativeGenerationActivation>>,
}

impl NativeGenerationServingCustody {
    pub(in crate::server) fn check_retained(&self) -> Result<()> {
        if *self.original.identity()? != *self.source.identity().source() {
            return Err(Error::NeedsRecovery);
        }
        if let Some(checkpoint) = &self.checkpoint
            && checkpoint.identity().source() != self.source.identity()
        {
            return Err(Error::NeedsRecovery);
        }
        Ok(())
    }
}

/// Activated native service with the genuine prepared host and serving choice.
/// No public constructor, native-parts escape or Deserialize capability exists.
/// Browser owners still need explicit reconciliation before whole-room readiness.
/// ```compile_fail
/// use breditor_collab_relay::server::ActivatedNativeLogGenerationHost;
/// let _: ActivatedNativeLogGenerationHost = serde_json::from_str("{}").unwrap();
/// ```
pub struct ActivatedNativeLogGenerationHost {
    pub(super) host: PreparedLogGenerationRecoveryHost,
    pub(super) selection: RoomDeploymentSelection,
}
impl ActivatedNativeLogGenerationHost {
    /// Detached epoch DATA, not a replacement grant or current status proof.
    #[must_use]
    pub fn selection(&self) -> &RoomDeploymentSelection {
        &self.selection
    }
    /// Authenticated native checks over the same actual owner. No source locks
    /// are released, reopened or replaced when obtaining this handle.
    #[must_use]
    pub fn recovery_host(&self) -> PreparedLogGenerationRecoveryHost {
        self.host.clone()
    }
    /// Construct native service routes. This does not bind a socket or deploy.
    /// Every stateful request remains behind the same shared serving epoch.
    /// Even an unserved or stale router retains actual custody until dropped.
    pub fn router(&self) -> Router {
        super::super::routes(self.host.host.clone())
    }
}
impl PreparedLogGenerationRecoveryHost {
    /// Preview a native-service-only choice using current account authentication,
    /// a genuine same-host protected-registration proof and an actual sealed source.
    /// Retain the result independently before the irreversible activation. This
    /// does not mutate files, create routes or certify provider/client closure.
    /// # Errors
    /// Wrong auth/host/origin, stale selected native/raster cut, unsealed or
    /// superseded source, changed custody or wrong/current epoch refuses.
    pub async fn preview_native_service_activation(
        &self,
        principal: &str,
        token: &str,
        authority: &RoomDeploymentAuthority,
        source: &Arc<PreparedLogGenerationHandover>,
        verified: &VerifiedServerLogGenerationRecoveryState,
    ) -> Result<NativeLogGenerationActivationIdentity> {
        self.host.authentication.authenticate(principal, token)?;
        verified.check_host(self, principal)?;
        let handle = self.clone();
        let principal = principal.to_owned();
        let authority = authority.clone();
        let source = source.clone();
        let current = verified.identity();
        tokio::task::spawn_blocking(move || {
            let original = handle.original.clone();
            let expected = current.clone();
            let owner = principal.clone();
            let custody = handle.host.generation_custody.clone().ok_or(Error::NeedsRecovery)?;
            let assets = handle.host.assets.clone().ok_or(Error::NeedsRecovery)?;
            handle.host.deployment.transaction(|| {
                let mut room = handle.host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                super::selected::check_selected(
                    &mut room,
                    &mut assets,
                    &original,
                    &custody,
                    &owner,
                    &expected,
                )
            })?;
            if source.status(&authority)? != crate::server::LogGenerationHandoverStatus::Sealed
                || authority.current_selection()? != *source.identity().planned_selection()
            {
                return Err(Error::Lease);
            }
            NativeLogGenerationActivationIdentity::new(source.identity().clone(), current)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
    /// Commit exactly one authenticated native-service activation. The complete
    /// target cut and source intent are rechecked under the shared attachment,
    /// real exclusive epoch, room and asset locks before a source/target-bound
    /// nonce is synced. All original custody stays attached to every host clone.
    /// This does not submit or acknowledge offline queues, adopt unbound comments,
    /// change roles, settle packets or claim whole-room activation readiness.
    /// A started blocking worker survives a dropped future. On uncertainty retain
    /// all files and the independently saved choice; never retry a saved lease.
    /// # Errors
    /// Any changed selection, auth/host mismatch, prior attachment, contention or
    /// uncertain storage refuses. A durable epoch may exist after an error; no
    /// lease is reconstructed from it and the old source cannot be revived.
    pub async fn activate_native_service(
        &self,
        principal: &str,
        token: &str,
        authority: RoomDeploymentAuthority,
        source: Arc<PreparedLogGenerationHandover>,
        verified: VerifiedServerLogGenerationRecoveryState,
        expected: NativeLogGenerationActivationIdentity,
    ) -> Result<ActivatedNativeLogGenerationHost> {
        self.host.authentication.authenticate(principal, token)?;
        verified.check_host(self, principal)?;
        let handle = self.clone();
        let owner = principal.to_owned();
        tokio::task::spawn_blocking(move || {
            let selection = deployment_fence::activate_native_generation(
                &handle,
                &owner,
                &authority,
                &source,
                &verified,
                &expected,
                &Interruption::default(),
            )?;
            Ok(ActivatedNativeLogGenerationHost { host: handle, selection })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
