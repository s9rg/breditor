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
    Error, Result, ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupFile,
    server::{
        LogGenerationHandoverStatus, PreparedLogGenerationHandover,
        generation_backup::durable::{Interruption, Point},
    },
};
use std::sync::Arc;
impl PreparedLogGenerationRecoveryHost {
    /// Durably prepare the first target cut before native service activation.
    /// Does not claim an epoch, change native state, acknowledge clients or start routes.
    /// Hold the selected deployment epoch through checkpoint persistence and readback.
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
        self.prepare_durable_checkpoint(
            principal,
            token,
            source,
            None,
            verified,
            (options, Interruption::default()),
        )
        .await
    }
    /// Prepare a fresh cold-restart decision from the exact committed checkpoint.
    /// Current target must retain all previous native/raster bytes and the SAME
    /// operational directory/intent owner. Fresh current registration proof remains required.
    /// The selected epoch stays held through the child checkpoint write and readback.
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
            (options, Interruption::default()),
        )
        .await
    }
    pub(in crate::server) async fn prepare_durable_checkpoint(
        &self,
        principal: &str,
        token: &str,
        source: Arc<PreparedLogGenerationHandover>,
        previous: Option<Arc<Prepared>>,
        verified: &VerifiedServerLogGenerationRecoveryState,
        preparation: (Options, Interruption),
    ) -> Result<Prepared> {
        let (options, stop) = preparation;
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
            let operation = handle.host.deployment.transaction(|| {
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
                let operation = custody.activation_owner_digest()?;
                if let Some(parent) = &previous
                    && parent.identity().operation() != operation
                {
                    return Err(Error::Contract("native checkpoint operational owner differs"));
                }
                Ok(operation)
            })?;
            let input = Inputs {
                source: source.identity().clone(),
                current: current.clone(),
                operation,
                previous: selected.clone(),
                parent: previous.as_ref().map(|p| p.identity().digest()).transpose()?,
            };
            stop.after(Point::SourceChecked)?;
            options.authority.with_checkpoint_epoch(
                selected,
                source.identity().planned_selection(),
                || {
                    // Use the held epoch to serialize both owners while writing the exact cut.
                    // A target edit since preflight refuses before creating the checkpoint root.
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
                    let store = Store::create(&options.root, input, &stop, |file| {
                        let info = ServerLogGenerationRoomBackup::capture_to(
                            &mut room, &assets, &owner, file,
                        )?;
                        if info.identity != current.server {
                            return Err(Error::Contract(
                                "native checkpoint current archive differs",
                            ));
                        }
                        let backup = ServerLogGenerationRoomBackupFile::open(
                            file.try_clone()?,
                            &current.server,
                        )?;
                        backup.check_archive_ancestor(source.source_backup())?;
                        if let Some(parent) = &previous {
                            backup.check_file_ancestor(parent.checkpoint_file()?)?;
                        }
                        check_selected(
                            &mut room,
                            &mut assets,
                            &handle.original,
                            custody,
                            &owner,
                            &current,
                        )?;
                        Ok(backup)
                    })?;
                    let prepared = Prepared { store, source: source.clone() };
                    prepared.guard()?;
                    Ok(prepared)
                },
            )
        })
        .await
        .map_err(|_| Error::NeedsRecovery)?
    }
}
