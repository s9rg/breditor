//! Explicit, evidence-preserving repair of the original sealed Native operational WAL.
mod evidence;

use super::{
    SealedNativeRestartBootstrap, ServerLogGenerationRecoveryStateIdentity,
    reopen_sealed_restart::reopen_retained_seal,
};
use crate::{Error, OperationalLogGenerationServerRoom, Result, server::Authentication};
use evidence::RetainedEvidence;
use std::path::PathBuf;

/// Independently retained files from authenticated inspection of a torn Native log.
pub struct SealedNativeTailRepairFiles {
    /// Complete inspected room archive in a private regular file outside the operational root.
    pub archive: PathBuf,
    /// Exact incomplete bytes in a separate private regular file outside the operational root.
    pub suffix: PathBuf,
    /// Independently retained byte count of the incomplete suffix.
    pub incomplete_bytes: u64,
    /// Independently retained SHA-256 of the incomplete suffix.
    pub incomplete_sha256: [u8; 32],
}

/// Result of applying the exact independently retained Native cut.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SealedNativeTailRepairOutcome {
    /// The selected incomplete suffix was removed and the complete WAL synchronized.
    Repaired,
    /// The same exact complete cut was already present and has been synchronized.
    AlreadyComplete,
}

/// Repair the original sealed room under fresh host authentication and the selected epoch.
///
/// Independently retain the inspected complete state identity, archive and suffix before calling.
/// The supplied bootstrap selects that exact cut. Actual replay, registration inventory,
/// original operational custody and full checkpoint ancestry are checked again. The archive
/// and suffix files are checked and synchronized under held ownership before removing only
/// the incomplete bytes from the selected active WAL. The selected epoch is held through sync
/// and readback. Retain both files after any uncertain outcome and retry using the same pins.
///
/// Use ordinary sealed restart with all protected registrations after repair. No activation,
/// publication or serving lease is created here.
/// # Errors
/// Wrong authentication, stale epoch, changed custody or cut, mismatched or unsynced evidence,
/// corrupt complete records, pending rotation or upload, or I/O failure refuse.
pub async fn repair_sealed_native_tail(
    bootstrap: SealedNativeRestartBootstrap,
    retained: SealedNativeTailRepairFiles,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<SealedNativeTailRepairOutcome> {
    authentication.authenticate(principal, token)?;
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let (source, selection, operating_directory) = reopen_retained_seal(bootstrap)?;
        selection.check_checkpoint()?;
        let evidence = RetainedEvidence::open(&retained, &operating_directory)?;
        let origin = source.source_backup().info()?.identity;
        OperationalLogGenerationServerRoom::with_committed_native_prefix(
            &operating_directory,
            source.source_backup(),
            &origin,
            selection.checkpoint.checkpoint(),
            &principal,
            true,
            |operational, captured| {
                let complete = captured.inspected.backup.info()?;
                let current = ServerLogGenerationRecoveryStateIdentity {
                    origin: origin.clone(),
                    server: complete.identity.clone(),
                    participants: captured.participants.identity(),
                };
                if current != selection.expected {
                    return Err(Error::Contract("native tail repair selected cut differs"));
                }
                if !captured.suffix.is_empty() && captured.suffix != evidence.suffix {
                    return Err(Error::Contract("native tail repair current suffix differs"));
                }
                selection
                    .check_operational_archive(captured.operation, &captured.inspected.backup)?;
                evidence.verify_and_sync(&complete)?;
                selection.authority.with_checkpoint_epoch(
                    selection.floor()?,
                    source.identity().planned_selection(),
                    || {
                        selection.checkpoint.guard()?;
                        evidence.guard()?;
                        operational.complete_inspected_native_prefix(
                            source.source_backup(),
                            &captured.inspected.backup,
                            &principal,
                            captured.inspected.incomplete_bytes,
                        )?;
                        evidence.guard()?;
                        selection.checkpoint.guard()?;
                        Ok(if captured.suffix.is_empty() {
                            SealedNativeTailRepairOutcome::AlreadyComplete
                        } else {
                            SealedNativeTailRepairOutcome::Repaired
                        })
                    },
                )
            },
        )
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
