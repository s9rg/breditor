//! Host admission of an independently selected sealed restart before activation.
use super::{
    NativeGenerationActivationCheckpointStatus as Status, PreparedLogGenerationRecoveryHost,
    PreparedNativeGenerationActivation, ServerLogGenerationRecoveryCoverage,
    ServerLogGenerationRecoveryStateIdentity,
};
use crate::{
    Error, RecoveryRegistrationCredentials, Result,
    server::{LogGenerationHandoverStatus, RoomDeploymentAuthority},
};
use std::sync::Arc;

/// An explicit existing checkpoint and expected state for one sealed restart.
pub struct SealedNativeRestartSelection {
    /// Actual independently opened sealed-source and checkpoint custody.
    pub checkpoint: Arc<PreparedNativeGenerationActivation>,
    /// The host's separately held deployment authority.
    pub authority: RoomDeploymentAuthority,
    /// The expected prepared or committed epoch. Superseded epochs refuse.
    pub status: Status,
    /// Exact independently retained current server and protected-stream identity.
    pub expected: ServerLogGenerationRecoveryStateIdentity,
}

impl PreparedLogGenerationRecoveryHost {
    /// Verify a sealed restart against this actual reopened operational owner.
    /// A prepared epoch requires its original exact checkpoint state. A
    /// committed epoch can select an independently retained descendant with
    /// new acknowledged document, comment, or raster data. Missing protected
    /// credentials return Pending. This opens no route, writes no checkpoint
    /// and creates no activation or publication permission.
    ///
    /// # Errors
    /// Stale authority, changed current state, different operational custody,
    /// incompatible ancestry, incorrect credentials or unverifiable files refuse.
    pub async fn verify_sealed_native_restart(
        &self,
        principal: &str,
        token: &str,
        selection: SealedNativeRestartSelection,
        supplied: RecoveryRegistrationCredentials,
    ) -> Result<ServerLogGenerationRecoveryCoverage> {
        self.host.authentication.authenticate(principal, token)?;
        let SealedNativeRestartSelection { checkpoint, authority, status, expected } = selection;
        let original = checkpoint.identity().current();
        let floor = match status {
            Status::Prepared if &expected == original => checkpoint.identity().previous_selection(),
            Status::Committed if expected.origin == original.origin => {
                checkpoint.identity().planned_selection()
            }
            _ => return Err(Error::Contract("sealed restart selected state differs")),
        }
        .clone();

        let capture = self.capture_recovery_state(principal, token).await?;
        if capture.identity()? != expected {
            return Err(Error::Contract("sealed restart current cut differs"));
        }
        let (archive, inventory) = capture.into_parts();
        let proof = self
            .verify_selected_recovery_state(principal, token, expected, inventory, supplied)
            .await?;
        let custody = self.host.generation_custody.clone().ok_or(Error::NeedsRecovery)?;
        tokio::task::spawn_blocking(move || {
            if custody.activation_owner_digest()? != checkpoint.identity().operation() {
                return Err(Error::Contract("sealed restart operational owner differs"));
            }
            archive.check_archive_ancestor(checkpoint.checkpoint())?;
            if checkpoint.status(&authority)? != status
                || authority.current_selection()? != floor
                || checkpoint.source.status(&authority)? != LogGenerationHandoverStatus::Sealed
            {
                return Err(Error::Lease);
            }
            Ok(proof)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
