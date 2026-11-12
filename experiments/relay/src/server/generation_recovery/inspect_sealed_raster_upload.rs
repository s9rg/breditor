//! Authenticate a read-only observation of a staging file left by an interrupted upload.
use super::{
    SealedNativeRestartBootstrap, ServerLogGenerationRecoveryState,
    reopen_sealed_restart::reopen_retained_seal,
};
use crate::{
    Error, OperationalLogGenerationServerRoom, Result, ServerLogGenerationRoomBackup,
    assets::PendingRasterUpload, server::Authentication,
};

/// Verified room state and detached evidence from its single interrupted raster upload.
pub struct SealedNativeRasterUploadInspection {
    /// Complete native and raster data and the protected registrations.
    pub state: ServerLogGenerationRecoveryState,
    /// Exact staged bytes, pinned independently of the room archive.
    pub upload: PendingRasterUpload,
}

/// Inspect an interrupted upload in the original sealed operating directory.
///
/// Supply the archive matching the bootstrap selection as `minimum` if it is later than
/// the checkpoint. The observation includes every complete published raster and records
/// whether the staging file also names a published raster. Inspection leaves both names
/// and their bytes intact.
///
/// # Errors
/// Invalid authentication, stale epoch, changed custody, unrelated links, multiple stages,
/// or other incomplete or unverifiable data refuse.
pub async fn inspect_sealed_native_raster_upload(
    bootstrap: SealedNativeRestartBootstrap,
    minimum: Option<ServerLogGenerationRoomBackup>,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<SealedNativeRasterUploadInspection> {
    authentication.authenticate(principal, token)?;
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let (source, selection, root) = reopen_retained_seal(bootstrap)?;
        selection.check_checkpoint()?;
        let minimum = selection.inspection_minimum(minimum.as_ref())?;
        let origin = source.source_backup().info()?.identity;
        OperationalLogGenerationServerRoom::with_committed_pending_raster(
            &root,
            source.source_backup(),
            &origin,
            minimum,
            &principal,
            |operational, capture| {
                let state = ServerLogGenerationRecoveryState {
                    origin: origin.clone(),
                    server: capture.backup,
                    participants: capture.participants,
                };
                selection.check_inspected_current(&state)?;
                selection.check_operational_archive(capture.operation, &state.server)?;
                selection.authority.with_checkpoint_epoch(
                    selection.floor()?,
                    source.identity().planned_selection(),
                    || {
                        selection.checkpoint.guard()?;
                        operational.recheck_pending_raster(capture.upload.selection_sha256)?;
                        Ok(SealedNativeRasterUploadInspection { state, upload: capture.upload })
                    },
                )
            },
        )
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
