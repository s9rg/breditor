//! Host admission of an independently selected sealed restart before activation.
use super::{
    NativeGenerationActivationCheckpointStatus as Status, PreparedLogGenerationRecoveryHost,
    PreparedNativeGenerationActivation, ServerLogGenerationRecoveryCoverage,
    ServerLogGenerationRecoveryStateIdentity,
};
use crate::{
    Error, RecoveryRegistrationCredentials, Result, ServerLogGenerationRoomBackup,
    server::{LogGenerationHandoverStatus, RoomDeploymentAuthority, RoomDeploymentSelection},
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

impl SealedNativeRestartSelection {
    fn floor(&self) -> Result<&RoomDeploymentSelection> {
        let original = self.checkpoint.identity().current();
        match self.status {
            Status::Prepared if &self.expected == original => {
                Ok(self.checkpoint.identity().previous_selection())
            }
            Status::Committed if self.expected.origin == original.origin => {
                Ok(self.checkpoint.identity().planned_selection())
            }
            _ => Err(Error::Contract("sealed restart selected state differs")),
        }
    }

    pub(super) fn check_checkpoint(&self) -> Result<()> {
        let floor = self.floor()?;
        if self.checkpoint.status(&self.authority)? != self.status
            || self.authority.current_selection()? != *floor
            || self.checkpoint.source.status(&self.authority)?
                != LogGenerationHandoverStatus::Sealed
        {
            return Err(Error::Lease);
        }
        Ok(())
    }

    pub(super) fn check_archive(
        &self,
        custody: &crate::room::GenerationOperationCustody,
        archive: &ServerLogGenerationRoomBackup,
    ) -> Result<()> {
        if custody.activation_owner_digest()? != self.checkpoint.identity().operation() {
            return Err(Error::Contract("sealed restart operational owner differs"));
        }
        archive.check_archive_ancestor(self.checkpoint.checkpoint())?;
        self.check_checkpoint()
    }
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
        selection.floor()?;
        let capture = self.capture_recovery_state(principal, token).await?;
        if capture.identity()? != selection.expected {
            return Err(Error::Contract("sealed restart current cut differs"));
        }
        let (archive, inventory) = capture.into_parts();
        let proof = self
            .verify_selected_recovery_state(
                principal,
                token,
                selection.expected.clone(),
                inventory,
                supplied,
            )
            .await?;
        let custody = self.host.generation_custody.clone().ok_or(Error::NeedsRecovery)?;
        tokio::task::spawn_blocking(move || {
            selection.check_archive(&custody, &archive)?;
            Ok(proof)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
