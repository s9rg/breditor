//! Preserve inspected bytes outside live storage before removing one exact staging entry.
use super::{
    NativeGenerationActivationCheckpointStatus as Status, SealedNativeRestartBootstrap,
    ServerLogGenerationRecoveryState, ServerLogGenerationRecoveryStateIdentity,
    reopen_sealed_restart::reopen_retained_seal, repair_evidence_file::RetainedRepairFile,
};
use crate::{Error, OperationalLogGenerationServerRoom, Result, server::Authentication};
use std::path::PathBuf;

const OUTSIDE: &str = "sealed raster evidence must be outside the operating directory";

/// Independently retained room and staging evidence from authenticated inspection.
pub struct SealedNativeRasterUploadRecoveryFiles {
    /// Exact inspected room archive in a private file outside the operating directory.
    pub archive: PathBuf,
    /// Exact staged bytes in a separate private file, including an empty or partial record.
    pub evidence: PathBuf,
    /// SHA-256 binding the staged bytes to the local inode and publication state.
    pub selection_sha256: [u8; 32],
}

/// Retire one inspected raster staging file under the original committed deployment epoch.
///
/// Select the exact inspected state in the bootstrap. The relay verifies and synchronizes both
/// retained files before removing the staging name. Any complete published raster remains
/// available at its final name. Unpublished bytes remain in the evidence file and the client
/// may retry its original upload. Use the returned state for explicit authenticated restart.
///
/// After an uncertain outcome, inspect again. If the staging name is gone, use ordinary sealed
/// restart inspection to select the complete cut.
///
/// # Errors
/// Invalid authentication, prepared or stale epoch, changed custody, absent or changed stage,
/// mismatched retained evidence, or uncertain writes refuse.
pub async fn retire_sealed_native_raster_upload(
    bootstrap: SealedNativeRestartBootstrap,
    retained: SealedNativeRasterUploadRecoveryFiles,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<ServerLogGenerationRecoveryState> {
    authentication.authenticate(principal, token)?;
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let (source, selection, root) = reopen_retained_seal(bootstrap)?;
        selection.check_checkpoint()?;
        if selection.status != Status::Committed {
            return Err(Error::Contract(
                "sealed raster retirement requires a committed checkpoint",
            ));
        }
        let canonical = root.canonicalize()?;
        let archive = RetainedRepairFile::open(&retained.archive, &canonical, OUTSIDE)?;
        let evidence = RetainedRepairFile::open(&retained.evidence, &canonical, OUTSIDE)?;
        let origin = source.source_backup().info()?.identity;
        OperationalLogGenerationServerRoom::with_committed_pending_raster(
            &root,
            source.source_backup(),
            &origin,
            selection.checkpoint.checkpoint()?,
            &principal,
            |operational, captured| {
                let complete = captured.backup.info()?;
                let current = ServerLogGenerationRecoveryStateIdentity {
                    origin: origin.clone(),
                    server: complete.identity.clone(),
                    participants: captured.participants.identity(),
                };
                if current != selection.expected {
                    return Err(Error::Contract("sealed raster retirement selected cut differs"));
                }
                selection.check_operational_archive(captured.operation, &captured.backup)?;
                if retained.selection_sha256 != captured.upload.selection_sha256
                    || evidence.digest(captured.upload.bytes)? != captured.upload.evidence_sha256
                    || archive.digest(complete.bytes)? != complete.identity.archive_sha256
                {
                    return Err(Error::Contract("sealed raster retained evidence differs"));
                }
                archive.sync()?;
                evidence.sync()?;
                selection.authority.with_checkpoint_epoch(
                    selection.floor()?,
                    source.identity().planned_selection(),
                    || {
                        selection.checkpoint.guard()?;
                        archive.guard()?;
                        evidence.guard()?;
                        operational.retire_pending_raster(
                            source.source_backup(),
                            &captured,
                            &principal,
                        )?;
                        archive.guard()?;
                        evidence.guard()?;
                        selection.checkpoint.guard()?;
                        Ok(ServerLogGenerationRecoveryState {
                            origin: origin.clone(),
                            server: captured.backup,
                            participants: captured.participants,
                        })
                    },
                )
            },
        )
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
