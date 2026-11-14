//! Authenticate a detached observation of an unfinished physical rotation.
use super::{
    SealedNativeRestartBootstrap, ServerLogGenerationRecoveryState,
    reopen_sealed_restart::reopen_retained_seal,
};
use crate::{
    Error, OperationalLogGenerationServerRoom, Result, ServerLogGenerationRoomBackup,
    assets::PendingRasterUpload, log::generations::PendingNativeLogRotation,
    server::Authentication,
};

/// The selected sealed room archive, protected registrations, and pending rotation evidence.
pub struct SealedNativeRotationInspection {
    /// Selected native and raster history with ordinary retained stages intact.
    pub state: ServerLogGenerationRecoveryState,
    /// Exact pending intent and observed physical phase, pinned separately from the archive.
    pub rotation: PendingNativeLogRotation,
}

/// Inspect a pending rotation under fresh sealed-room authentication and checkpoint custody.
///
/// The bootstrap identifies the independently retained floor. Supply its exact archive as
/// `minimum` if the floor is later than the checkpoint. The complete selected archive retains
/// all ordinary stages. The intent and its transient aliases are verified and pinned separately.
/// Inspection leaves the original files in place and creates no serving or activation authority.
///
/// # Errors
/// Wrong authentication, stale epoch, changed custody, invalid or absent pending rotation,
/// an incomplete native frame or raster upload, or missing retained history refuse.
pub async fn inspect_sealed_native_rotation(
    bootstrap: SealedNativeRestartBootstrap,
    minimum: Option<ServerLogGenerationRoomBackup>,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<SealedNativeRotationInspection> {
    Ok(inspect_rotation(bootstrap, minimum, authentication, principal, token, false).await?.0)
}

pub(super) async fn inspect_rotation(
    bootstrap: SealedNativeRestartBootstrap,
    minimum: Option<ServerLogGenerationRoomBackup>,
    authentication: Authentication,
    principal: &str,
    token: &str,
    include_raster: bool,
) -> Result<(SealedNativeRotationInspection, Option<PendingRasterUpload>)> {
    authentication.authenticate(principal, token)?;
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let (source, selection, root) = reopen_retained_seal(bootstrap)?;
        selection.check_checkpoint()?;
        let minimum = selection.inspection_minimum_archive(minimum.as_ref())?;
        let origin = source.source_backup().info()?.identity;
        OperationalLogGenerationServerRoom::with_committed_pending_rotation(
            &root,
            source.source_backup(),
            &origin,
            minimum,
            &principal,
            include_raster,
            |operational, capture| {
                let state = ServerLogGenerationRecoveryState {
                    origin: origin.clone(),
                    server: capture.backup,
                    participants: capture.participants,
                };
                selection.check_inspected_current(&state.identity()?)?;
                selection.check_operational_archive(capture.operation, &state.server)?;
                selection.authority.with_checkpoint_epoch(
                    selection.floor()?,
                    source.identity().planned_selection(),
                    || {
                        selection.checkpoint.guard()?;
                        operational.recheck_pending_rotation(capture.rotation.evidence_sha256)?;
                        if let Some(upload) = &capture.upload {
                            operational.assets().recheck_pending_upload(upload.selection_sha256)?;
                        }
                        Ok((
                            SealedNativeRotationInspection { state, rotation: capture.rotation },
                            capture.upload,
                        ))
                    },
                )
            },
        )
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
