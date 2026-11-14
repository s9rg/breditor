//! Inspect surviving committed Native data before selecting it for activation.
use super::ServerLogGenerationRecoveryStateIdentity;
use super::{
    SealedNativeRestartBootstrap, ServerLogGenerationRecoveryState,
    open_sealed_restart::open_sealed_native_restart_target,
    reopen_sealed_restart::reopen_retained_seal,
};
use crate::{
    Error, Result, ServerLogGenerationParticipantInventory, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupFile, server::Authentication,
};
use std::fs::File;

/// Capture the complete surviving room and inventory under fresh host authentication.
/// `bootstrap.expected_current` selects the minimum independently retained cut. If
/// it is later than the checkpoint, supply that exact retained archive as `minimum`.
/// A prepared checkpoint must still match exactly. A committed checkpoint can
/// expose a complete descendant that includes later accepted edits or uploads.
///
/// This returns detached data and releases the reopened custody. Retain the
/// observed identity independently and use explicit restart admission with all
/// protected credentials before preparing activation.
/// # Errors
/// Wrong authentication, changed ownership, stale epochs, absent or mismatched
/// minimum archives, or unverifiable Native or raster history refuse.
pub async fn inspect_sealed_native_restart(
    bootstrap: SealedNativeRestartBootstrap,
    minimum: Option<ServerLogGenerationRoomBackup>,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<ServerLogGenerationRecoveryState> {
    authentication.authenticate(principal, token)?;
    let (_, selection, root) = tokio::task::spawn_blocking(move || reopen_retained_seal(bootstrap))
        .await
        .map_err(|_| Error::NeedsRecovery)??;
    selection.inspection_minimum(minimum.as_ref())?;
    let (host, selection) = Box::pin(open_sealed_native_restart_target(
        &root,
        authentication,
        principal,
        token,
        selection,
    ))
    .await?;
    let captured = host.capture_recovery_state(principal, token).await?;
    let custody = host.host.generation_custody.clone().ok_or(Error::NeedsRecovery)?;
    tokio::task::spawn_blocking(move || {
        selection.check_inspected_current(&captured.identity()?)?;
        if let Some(archive) = minimum {
            captured.server.check_archive_ancestor(&archive)?;
        }
        selection.check_archive(&custody, &captured.server)?;
        Ok(captured)
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}

/// Stream the exact surviving current cut to a caller-owned empty file. This follows the same
/// checkpoint and minimum rules as `inspect_sealed_native_restart`. Keep output private until
/// success, sync it before publication and retain its returned identity independently.
/// # Errors
/// Wrong authentication, divergent selections or history, changed custody or output errors refuse.
pub async fn inspect_sealed_native_restart_to(
    bootstrap: SealedNativeRestartBootstrap,
    minimum: Option<ServerLogGenerationRoomBackup>,
    authentication: Authentication,
    principal: &str,
    token: &str,
    output: File,
) -> Result<(ServerLogGenerationRecoveryStateIdentity, ServerLogGenerationParticipantInventory)> {
    authentication.authenticate(principal, token)?;
    let (_, selection, root) = tokio::task::spawn_blocking(move || reopen_retained_seal(bootstrap))
        .await
        .map_err(|_| Error::NeedsRecovery)??;
    selection.inspection_minimum(minimum.as_ref())?;
    let (host, selection) = Box::pin(open_sealed_native_restart_target(
        &root,
        authentication,
        principal,
        token,
        selection,
    ))
    .await?;
    let readback = output.try_clone()?;
    let (current, participants) = host.capture_recovery_state_to(principal, token, output).await?;
    let custody = host.host.generation_custody.clone().ok_or(Error::NeedsRecovery)?;
    tokio::task::spawn_blocking(move || {
        selection.check_inspected_current(&current)?;
        let observed = ServerLogGenerationRoomBackupFile::open(readback, &current.server)?;
        if let Some(archive) = minimum {
            observed.check_archive_ancestor(&archive)?;
        }
        if custody.activation_owner_digest()? != selection.checkpoint.identity().operation() {
            return Err(Error::Contract("sealed restart operational owner differs"));
        }
        observed.check_file_ancestor(selection.checkpoint.checkpoint_file()?)?;
        selection.check_checkpoint()?;
        Ok((current, participants))
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
