//! Inspect surviving committed Native data before selecting it for activation.
use super::{
    NativeGenerationActivationCheckpointStatus as Status, SealedNativeRestartBootstrap,
    ServerLogGenerationRecoveryState, open_sealed_restart::open_sealed_native_restart_target,
    reopen_sealed_restart::reopen_retained_seal,
};
use crate::{Error, Result, ServerLogGenerationRoomBackup, server::Authentication};

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
    let expected = &selection.expected;
    if expected.participants.source != expected.server.native {
        return Err(Error::Contract("sealed inspection minimum inventory differs"));
    }
    match &minimum {
        Some(archive) if archive.info()?.identity == expected.server => {}
        None if expected == selection.checkpoint.identity().current() => {}
        _ => return Err(Error::Contract("sealed inspection minimum archive differs")),
    }
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
        if captured.origin != selection.expected.origin
            || selection.status == Status::Prepared && captured.identity()? != selection.expected
        {
            return Err(Error::Contract("sealed inspection current cut differs"));
        }
        if let Some(archive) = minimum {
            captured.server.check_archive_ancestor(&archive)?;
        }
        selection.check_archive(&custody, &captured.server)?;
        Ok(captured)
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
