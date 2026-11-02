//! Trusted host configuration selects files, source, authority and credentials.
use super::{
    DurableNativeActivationControl, DurableNativeActivationControlIdentity, routes,
    state::{Commit, State},
};
use crate::{
    Error, Result,
    server::{
        Authentication, PreparedLogGenerationRecoveryHost, PreparedNativeGenerationActivation,
        RoomDeploymentAuthority, VerifiedServerLogGenerationRecoveryState,
    },
};
use std::sync::{Arc, Mutex, atomic::AtomicBool};
use tokio::sync::Semaphore;

/// Prepare an opt-in POST/OPTIONS `/recovery/native-activation/v1/commit` router.
/// The checkpoint and source must already be durable. Requires fresh native
/// account authentication, genuine same-host registration proof, the exact prior
/// epoch and independently provisioned operator accounts. Does not activate,
/// bind a socket, install normal routes or acknowledge client/offline work.
/// Retain the returned identity independently before sending the first commit.
/// # Errors
/// Shared credentials, stale proof, mismatched checkpoint/source/authority,
/// already committed/superseded epoch or changed file custody refuses.
pub async fn prepare_durable_native_activation_control(
    host: PreparedLogGenerationRecoveryHost,
    proof: Arc<VerifiedServerLogGenerationRecoveryState>,
    prepared: Arc<PreparedNativeGenerationActivation>,
    authority: RoomDeploymentAuthority,
    owner: &str,
    native_token: &str,
    operators: Authentication,
) -> Result<(axum::Router, DurableNativeActivationControl)> {
    host.host.authentication.authenticate(owner, native_token)?;
    if operators.shares_account_tokens(&host.host.authentication) {
        return Err(Error::Contract("operator credentials must be independently provisioned"));
    }
    proof.check_live(&host, owner, native_token).await?;
    let owner = owner.to_owned();
    let native_token_digest = crate::credentials::hash(native_token)?;
    tokio::task::spawn_blocking(move || {
        prepared.guard()?;
        if prepared.identity().current() != &proof.identity()
            || prepared.status(&authority)?
                != super::super::NativeGenerationActivationCheckpointStatus::Prepared
            || authority.current_selection()? != *prepared.identity().previous_selection()
        {
            return Err(Error::Contract("activation control selected checkpoint differs"));
        }
        let selection = DurableNativeActivationControlIdentity {
            format: "breditor/durable-native-activation-control".into(),
            format_version: 1,
            instance: crate::credentials::issue()?,
            checkpoint_sha256: prepared.identity().digest()?,
            current: proof.identity(),
            previous: prepared.identity().previous_selection().clone(),
            planned: prepared.identity().planned_selection().clone(),
        };
        let state = Arc::new(State {
            host,
            proof,
            prepared,
            authority,
            owner,
            native_token_digest,
            operators,
            selection,
            live: AtomicBool::new(true),
            requests: Arc::new(Semaphore::new(1)),
            commit: Mutex::new(Commit::Prepared),
        });
        Ok((routes::router(Arc::downgrade(&state)), DurableNativeActivationControl { state }))
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
