//! Complete one exactly inspected rotation under the original committed deployment epoch.
use super::{
    NativeGenerationActivationCheckpointStatus as Status, SealedNativeRestartBootstrap,
    ServerLogGenerationRecoveryState, ServerLogGenerationRecoveryStateIdentity,
    reopen_sealed_restart::reopen_retained_seal, repair_evidence_file::RetainedRepairFile,
};
use crate::{
    Error, OperationalLogGenerationServerRoom, Result, assets::PendingRasterUpload,
    server::Authentication,
};
use std::path::PathBuf;

const OUTSIDE: &str = "sealed rotation evidence must be outside the operating directory";

/// Independently retained evidence from authenticated sealed rotation inspection.
pub struct SealedNativeRotationCompletionFiles {
    /// Exact inspected room archive in a private regular file outside the operating directory.
    pub archive: PathBuf,
    /// Exact versioned rotation evidence in a separate private file outside the operating directory.
    pub evidence: PathBuf,
    /// SHA-256 independently retained from the inspection.
    pub evidence_sha256: [u8; 32],
}

#[derive(Default)]
pub(in crate::server) struct RotationCompletionInterruption {
    #[cfg(test)]
    pub(in crate::server) stop_at: Option<crate::log::generations::RotationPoint>,
}

pub(super) struct RetainedRasterStage {
    pub(super) path: PathBuf,
    pub(super) selection_sha256: [u8; 32],
}

fn verify_and_sync_stage(
    file: &RetainedRepairFile,
    selected: [u8; 32],
    observed: Option<&PendingRasterUpload>,
) -> Result<()> {
    let upload =
        observed.ok_or(Error::Contract("combined rotation completion lacks raster evidence"))?;
    if upload.selection_sha256 != selected || file.digest(upload.bytes)? != upload.evidence_sha256 {
        return Err(Error::Contract("combined rotation retained raster evidence differs"));
    }
    file.sync()
}

/// Complete a pending rotation in the original operating directory of a committed sealed room.
///
/// Select the exact inspected state in the bootstrap and independently retain both evidence files
/// before calling. The relay reacquires original storage and checkpoint custody, replays the
/// selected room, and verifies and synchronizes the evidence before publishing the intent's exact
/// physical transition under the held epoch. The returned state selects the completed archive and
/// protected registrations for a subsequent explicit authenticated restart.
///
/// After interruption, inspect the current pending phase and retain its evidence before retrying.
/// If the rotation already finished, ordinary sealed restart inspection can select the complete
/// cut. A prepared checkpoint still requires its original exact archive.
///
/// # Errors
/// Invalid authentication, prepared or stale epochs, changed custody, absent or changed pending
/// work, mismatched retained evidence, or uncertain writes refuse.
pub async fn complete_sealed_native_rotation(
    bootstrap: SealedNativeRestartBootstrap,
    retained: SealedNativeRotationCompletionFiles,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<ServerLogGenerationRecoveryState> {
    complete_sealed_native_rotation_with_interruption(
        bootstrap,
        retained,
        authentication,
        principal,
        token,
        RotationCompletionInterruption::default(),
    )
    .await
}

pub(in crate::server) async fn complete_sealed_native_rotation_with_interruption(
    bootstrap: SealedNativeRestartBootstrap,
    retained: SealedNativeRotationCompletionFiles,
    authentication: Authentication,
    principal: &str,
    token: &str,
    interruption: RotationCompletionInterruption,
) -> Result<ServerLogGenerationRecoveryState> {
    complete_rotation(bootstrap, retained, None, authentication, principal, token, interruption)
        .await
}

pub(super) async fn complete_rotation(
    bootstrap: SealedNativeRestartBootstrap,
    retained: SealedNativeRotationCompletionFiles,
    raster: Option<RetainedRasterStage>,
    authentication: Authentication,
    principal: &str,
    token: &str,
    interruption: RotationCompletionInterruption,
) -> Result<ServerLogGenerationRecoveryState> {
    authentication.authenticate(principal, token)?;
    #[cfg(not(test))]
    let _ = interruption;
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let (source, selection, root) = reopen_retained_seal(bootstrap)?;
        selection.check_checkpoint()?;
        if selection.status != Status::Committed {
            return Err(Error::Contract(
                "sealed rotation completion requires a committed checkpoint",
            ));
        }
        let canonical = root.canonicalize()?;
        let archive = RetainedRepairFile::open(&retained.archive, &canonical, OUTSIDE)?;
        let evidence = RetainedRepairFile::open(&retained.evidence, &canonical, OUTSIDE)?;
        let stage = raster
            .map(|retained| {
                let file = RetainedRepairFile::open(&retained.path, &canonical, OUTSIDE)?;
                Ok::<_, Error>((file, retained.selection_sha256))
            })
            .transpose()?;
        let origin = source.source_backup().info()?.identity;
        OperationalLogGenerationServerRoom::with_committed_pending_rotation(
            &root,
            source.source_backup(),
            &origin,
            selection.checkpoint.checkpoint(),
            &principal,
            stage.is_some(),
            |operational, captured| {
                let complete = captured.backup.info()?;
                let current = ServerLogGenerationRecoveryStateIdentity {
                    origin: origin.clone(),
                    server: complete.identity.clone(),
                    participants: captured.participants.identity(),
                };
                if current != selection.expected {
                    return Err(Error::Contract("sealed rotation completion selected cut differs"));
                }
                selection.check_operational_archive(captured.operation, &captured.backup)?;
                if retained.evidence_sha256 != captured.rotation.evidence_sha256
                    || evidence.read(captured.rotation.evidence_bytes().len() as u64)?
                        != captured.rotation.evidence_bytes()
                    || archive.digest(complete.bytes)? != complete.identity.archive_sha256
                {
                    return Err(Error::Contract("sealed rotation retained evidence differs"));
                }
                archive.sync()?;
                evidence.sync()?;
                if let Some((file, selected)) = &stage {
                    verify_and_sync_stage(file, *selected, captured.upload.as_ref())?;
                }
                selection.authority.with_checkpoint_epoch(
                    selection.floor()?,
                    source.identity().planned_selection(),
                    || {
                        selection.checkpoint.guard()?;
                        archive.guard()?;
                        evidence.guard()?;
                        if let Some((file, _)) = &stage {
                            file.guard()?;
                        }
                        #[cfg(test)]
                        if let Some(point) = interruption.stop_at {
                            operational.room_mut().interrupt_log_rotation_for_test(point)?;
                        }
                        let (server, participants) = operational.complete_pending_rotation(
                            source.source_backup(),
                            captured,
                            &principal,
                        )?;
                        archive.guard()?;
                        evidence.guard()?;
                        if let Some((file, _)) = &stage {
                            file.guard()?;
                        }
                        selection.checkpoint.guard()?;
                        Ok(ServerLogGenerationRecoveryState {
                            origin: origin.clone(),
                            server,
                            participants,
                        })
                    },
                )
            },
        )
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
