//! Validate three independent evidence files before either live storage mutation.
use super::super::{
    SealedNativeRestartBootstrap, ServerLogGenerationRecoveryState,
    ServerLogGenerationRecoveryStateIdentity, reopen_sealed_restart::reopen_retained_seal,
    repair_evidence_file::RetainedRepairFile,
};
use super::{RetainedEvidence, SealedNativeTailRepairFiles};
use crate::{
    Error, OperationalLogGenerationServerRoom, Result,
    log::generations::NativeTailRepairInterruption,
    server::{Authentication, NativeGenerationActivationCheckpointStatus as Status},
};
use std::path::PathBuf;

/// Independently retained evidence for a combined sealed recovery.
pub struct SealedNativeTailAndRasterRepairFiles {
    /// Complete archive, incomplete suffix and its exact length and SHA-256.
    pub tail: SealedNativeTailRepairFiles,
    /// Exact staged raster bytes in another private file outside the operating directory.
    pub raster_stage: PathBuf,
    /// Pin binding the stage bytes to the original inode and publication state.
    pub raster_selection_sha256: [u8; 32],
}

/// Repair the exact inspected WAL prefix and retire its interrupted raster stage.
///
/// Supply the independently selected cut and retain all three files outside the operating
/// directory. The relay synchronizes the evidence before truncating the WAL. It then verifies
/// the complete Native history and retires the staging name under the same held deployment
/// epoch. Published raster inodes remain selected. Unpublished bytes stay in the retained
/// evidence. Use the returned state for explicit authenticated restart.
///
/// Retry with the same files and pins if the WAL is already complete and the raster stage
/// remains. If the stage is gone, use ordinary sealed restart inspection to select the result.
///
/// # Errors
/// Prepared or stale epoch, wrong auth or cut, corrupt complete records, changed custody or
/// evidence, missing stage, unrelated files or uncertain writes refuse.
pub async fn repair_sealed_native_tail_and_raster(
    bootstrap: SealedNativeRestartBootstrap,
    retained: SealedNativeTailAndRasterRepairFiles,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<ServerLogGenerationRecoveryState> {
    repair_sealed_native_tail_and_raster_with_interruption(
        bootstrap,
        retained,
        authentication,
        principal,
        token,
        NativeTailRepairInterruption::default(),
    )
    .await
}

pub(in crate::server) async fn repair_sealed_native_tail_and_raster_with_interruption(
    bootstrap: SealedNativeRestartBootstrap,
    retained: SealedNativeTailAndRasterRepairFiles,
    authentication: Authentication,
    principal: &str,
    token: &str,
    interruption: NativeTailRepairInterruption,
) -> Result<ServerLogGenerationRecoveryState> {
    authentication.authenticate(principal, token)?;
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let (source, selection, root) = reopen_retained_seal(bootstrap)?;
        selection.check_checkpoint()?;
        if selection.status != Status::Committed {
            return Err(Error::Contract("combined repair requires a committed checkpoint"));
        }
        let native_evidence = RetainedEvidence::open(&retained.tail, &root)?;
        let raster_evidence = RetainedRepairFile::open(
            &retained.raster_stage,
            &root.canonicalize()?,
            "combined raster evidence must be outside the operating directory",
        )?;
        let origin = source.source_backup().info()?.identity;
        OperationalLogGenerationServerRoom::with_committed_native_prefix_and_pending_raster(
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
                    return Err(Error::Contract("combined repair selected cut differs"));
                }
                selection.check_operational_archive(captured.operation, &captured.backup)?;
                if (!captured.suffix.is_empty() && captured.suffix != native_evidence.suffix)
                    || captured.upload.selection_sha256 != retained.raster_selection_sha256
                    || raster_evidence.digest(captured.upload.bytes)?
                        != captured.upload.evidence_sha256
                {
                    return Err(Error::Contract("combined repair retained evidence differs"));
                }
                native_evidence.verify_and_sync(&complete)?;
                raster_evidence.sync()?;
                selection.authority.with_checkpoint_epoch(
                    selection.floor()?,
                    source.identity().planned_selection(),
                    || {
                        selection.checkpoint.guard()?;
                        native_evidence.guard()?;
                        raster_evidence.guard()?;
                        operational.repair_native_prefix_and_raster(
                            source.source_backup(),
                            &captured,
                            &principal,
                            interruption,
                        )?;
                        native_evidence.guard()?;
                        raster_evidence.guard()?;
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
