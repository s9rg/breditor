//! Authenticate simultaneous WAL and raster evidence without changing either source.
use super::{
    SealedNativeRestartBootstrap, SealedNativeTailInspection, ServerLogGenerationRecoveryState,
    reopen_sealed_restart::reopen_retained_seal,
};
use crate::{
    Error, OperationalLogGenerationServerRoom, Result, ServerLogGenerationRoomBackup,
    assets::PendingRasterUpload, server::Authentication,
};
use sha2::{Digest, Sha256};

/// One complete surviving room cut and separate evidence for each interrupted write.
pub struct SealedNativeTailAndRasterInspection {
    /// Complete archive, registration inventory and the exact incomplete WAL suffix.
    pub tail: SealedNativeTailInspection,
    /// Exact raster stage and its local publication state.
    pub upload: PendingRasterUpload,
}

/// Inspect a sealed room with a torn WAL frame and one interrupted raster upload.
///
/// Supply the exact independently retained archive matching the bootstrap's floor when it
/// is newer than the checkpoint. Both observations come from the same locked operating
/// directory, under the same checkpoint and deployment epoch. Retain the archive, suffix,
/// raster stage and their pins before an explicit repair.
///
/// # Errors
/// Invalid authentication or epoch, changed custody, missing retained work, either fault
/// absent, failed replay, pending rotation or unrelated raster files refuse.
pub async fn inspect_sealed_native_tail_and_raster(
    bootstrap: SealedNativeRestartBootstrap,
    minimum: Option<ServerLogGenerationRoomBackup>,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<SealedNativeTailAndRasterInspection> {
    authentication.authenticate(principal, token)?;
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let (source, selection, root) = reopen_retained_seal(bootstrap)?;
        selection.check_checkpoint()?;
        let minimum = selection.inspection_minimum(minimum.as_ref())?;
        let origin = source.source_backup().info()?.identity;
        OperationalLogGenerationServerRoom::with_committed_native_prefix_and_pending_raster(
            &root,
            source.source_backup(),
            &origin,
            minimum,
            &principal,
            |operational, capture| {
                if capture.suffix.is_empty() {
                    return Err(Error::Contract("combined inspection requires an incomplete WAL"));
                }
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
                        Ok(SealedNativeTailAndRasterInspection {
                            tail: SealedNativeTailInspection {
                                state,
                                incomplete_bytes: capture.suffix.len() as u64,
                                incomplete_sha256: Sha256::digest(&capture.suffix).into(),
                                suffix: capture.suffix,
                            },
                            upload: capture.upload,
                        })
                    },
                )
            },
        )
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
