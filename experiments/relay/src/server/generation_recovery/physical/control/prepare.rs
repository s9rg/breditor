//! Explicit host-side preparation; editor account tokens cannot become operator credentials.
use super::super::{PreparedPhysicalRoomRecoveryHost, VerifiedPhysicalServerRecoveryAssets};
use super::{
    PhysicalRoomRecoveryControl, PhysicalRoomRecoveryControlIdentity, lease::State, routes,
};
use crate::{
    Error, Result,
    server::{Authentication, ServerRecoveryAssetProvider},
};
use axum::Router;
use std::sync::{Arc, atomic::AtomicBool};
use tokio::sync::Semaphore;

/// Prepare the separate `/recovery/physical/v1/check` POST/OPTIONS operator router.
/// Requires a genuine current physical byte proof, actual native owner authentication and an
/// independently provisioned operator account/Origin configuration with no reused editor tokens.
/// The caller must keep the returned control guard alive. Serving/binding is an explicit caller
/// action; ordinary constructors/routes remain unchanged. The response contains only the checked
/// selection/scope, not history/archive bytes, asset references, mappings or protected credentials.
/// No editing, upload, restore or activation endpoint is registered.
/// # Errors
/// Refuses shared operator/editor tokens, stale/foreign proofs, wrong native auth and source,
/// provider, raster or native custody failures before creating any router or control instance.
pub async fn prepare_physical_room_recovery_control(
    host: PreparedPhysicalRoomRecoveryHost,
    proof: Arc<VerifiedPhysicalServerRecoveryAssets>,
    provider: Arc<dyn ServerRecoveryAssetProvider>,
    owner: &str,
    native_token: &str,
    operators: Authentication,
) -> Result<(Router, PhysicalRoomRecoveryControl)> {
    host.local.host.authentication.authenticate(owner, native_token)?;
    if operators.shares_account_tokens(&host.local.host.authentication) {
        return Err(Error::Contract("operator credentials must be independently provisioned"));
    }
    proof.check_live(&host, owner, native_token, provider.clone()).await?;
    let selection = PhysicalRoomRecoveryControlIdentity {
        format: "breditor/physical-room-recovery-control".into(),
        format_version: 1,
        instance: crate::credentials::issue()?,
        source: proof.identity(),
    };
    let state = Arc::new(State {
        host,
        proof,
        provider,
        owner: owner.into(),
        native_token_digest: crate::credentials::hash(native_token)?,
        operators,
        selection,
        live: AtomicBool::new(true),
        requests: Arc::new(Semaphore::new(2)),
    });
    Ok((routes::router(Arc::downgrade(&state)), PhysicalRoomRecoveryControl { state }))
}
