//! Capture genuine current target and immutable ancestry before creating any checkpoint root.
use super::super::{
    PreparedLogGenerationRecoveryHost, VerifiedServerLogGenerationRecoveryState,
    selected::check_selected,
};
use super::{
    NativeGenerationActivationPrepareOptions as Options,
    PreparedNativeGenerationActivation as Prepared,
    store::{Inputs, Store},
};
use crate::{
    Error, Result, ServerLogGenerationRoomBackup,
    server::{
        LogGenerationHandoverStatus, PreparedLogGenerationHandover,
        generation_backup::durable::Interruption,
    },
};
use std::sync::Arc;
impl PreparedLogGenerationRecoveryHost {
    /// Durably prepare the first target cut before native service activation.
    /// Does not claim an epoch, change native state, acknowledge clients or start routes.
    /// Persist the result identity independently. A started worker survives cancellation.
    /// # Errors
    /// Wrong current auth/host/source/epoch, stale whole target, occupied root or I/O refuses.
    pub async fn prepare_durable_native_activation(
        &self,
        principal: &str,
        token: &str,
        source: Arc<PreparedLogGenerationHandover>,
        verified: &VerifiedServerLogGenerationRecoveryState,
        options: Options,
    ) -> Result<Prepared> {
        self.prepare_durable_checkpoint(principal, token, source, None, verified, options).await
    }
    /// Prepare a fresh cold-restart decision from the exact committed checkpoint.
    /// Current target must retain all previous native/raster bytes and the SAME
    /// operational directory/intent owner. Fresh current registration proof remains required.
    /// No old serving lease is reconstructed. Old checkpoint files are not rewritten.
    /// # Errors
    /// Wrong auth/owner, uncommitted/superseded parent, native/raster rollback or fork,
    /// different actual operational owner, stale current proof, occupied path or I/O refuses.
    pub async fn prepare_durable_native_restart(
        &self,
        principal: &str,
        token: &str,
        previous: Arc<Prepared>,
        verified: &VerifiedServerLogGenerationRecoveryState,
        options: Options,
    ) -> Result<Prepared> {
        self.prepare_durable_checkpoint(
            principal,
            token,
            previous.source.clone(),
            Some(previous),
            verified,
            options,
        )
        .await
    }
    async fn prepare_durable_checkpoint(
        &self,
        principal: &str,
        token: &str,
        source: Arc<PreparedLogGenerationHandover>,
        previous: Option<Arc<Prepared>>,
        verified: &VerifiedServerLogGenerationRecoveryState,
        options: Options,
    ) -> Result<Prepared> {
        self.host.authentication.authenticate(principal, token)?;
        verified.check_host(self, principal)?;
        let handle = self.clone();
        let owner = principal.to_owned();
        let current = verified.identity();
        tokio::task::spawn_blocking(move || {
            if source.status(&options.authority)? != LogGenerationHandoverStatus::Sealed {
                return Err(Error::Lease);
            }
            let selected = if let Some(parent) = &previous {
                parent.guard()?;
                parent.identity().planned_selection()
            } else {
                source.identity().planned_selection()
            };
            if options.authority.current_selection()? != *selected {
                return Err(Error::Lease);
            }
            let custody = handle.host.generation_custody.as_ref().ok_or(Error::NeedsRecovery)?;
            let assets = handle.host.assets.as_ref().ok_or(Error::NeedsRecovery)?;
            let (backup, operation) = handle.host.deployment.transaction(|| {
                let mut room = handle.host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                check_selected(
                    &mut room,
                    &mut assets,
                    &handle.original,
                    custody,
                    &owner,
                    &current,
                )?;
                let backup =
                    ServerLogGenerationRoomBackup::capture(&mut room, &mut assets, &owner)?;
                let operation = custody.activation_owner_digest()?;
                if let Some(parent) = &previous {
                    if parent.identity().operation() != operation {
                        return Err(Error::Contract("native checkpoint operational owner differs"));
                    }
                    backup.check_archive_ancestor(parent.checkpoint())?;
                    parent.guard()?;
                }
                backup.check_archive_ancestor(source.source_backup())?;
                check_selected(
                    &mut room,
                    &mut assets,
                    &handle.original,
                    custody,
                    &owner,
                    &current,
                )?;
                Ok((backup, operation))
            })?;
            let input = Inputs {
                source: source.identity().clone(),
                current,
                operation,
                previous: selected.clone(),
                parent: previous.as_ref().map(|p| p.identity().digest()).transpose()?,
            };
            let store = Store::create(&options.root, backup, input, &Interruption::default())?;
            let prepared = Prepared { store, source };
            prepared.guard()?;
            Ok(prepared)
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
