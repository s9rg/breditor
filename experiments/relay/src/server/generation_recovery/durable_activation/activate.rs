//! Fresh current auth and actual prepared target custody precede native serving.
use super::super::{
    ActivatedNativeLogGenerationHost, PreparedLogGenerationRecoveryHost,
    VerifiedServerLogGenerationRecoveryState,
};
use super::{
    PreparedNativeGenerationActivation as Prepared,
    PreparedNativeGenerationActivationIdentity as Identity,
};
use crate::{
    Error, Result,
    server::{RoomDeploymentAuthority, deployment_fence, generation_backup::durable::Interruption},
};
use std::sync::Arc;
impl PreparedLogGenerationRecoveryHost {
    /// Activate the exact durably prepared target once, including a fresh cold restart.
    /// Current account credentials and a genuine same-host complete registration proof
    /// are mandatory. Saved DTOs never reissue old leases. Every source/checkpoint/native
    /// owner stays attached to older handles, routes and detached workers. Does not claim
    /// provider/client/outbox closure or coordinated whole-room readiness.
    /// # Errors
    /// Wrong auth/host/choice, changed target/operation, stale epoch, custody or I/O refuses.
    /// An error may follow a durable append; retain all files and independent selections.
    pub async fn activate_durable_native_service(
        &self,
        principal: &str,
        token: &str,
        authority: RoomDeploymentAuthority,
        prepared: Arc<Prepared>,
        verified: VerifiedServerLogGenerationRecoveryState,
        expected: Identity,
    ) -> Result<ActivatedNativeLogGenerationHost> {
        self.host.authentication.authenticate(principal, token)?;
        verified.check_host(self, principal)?;
        if prepared.identity() != &expected {
            return Err(Error::Contract("durable native activation selected checkpoint differs"));
        }
        let handle = self.clone();
        let owner = principal.to_owned();
        tokio::task::spawn_blocking(move || {
            let selection = deployment_fence::activate_durable_native_generation(
                &handle,
                &owner,
                &authority,
                &prepared,
                &verified,
                &Interruption::default(),
            )?;
            Ok(ActivatedNativeLogGenerationHost { host: handle, selection })
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
