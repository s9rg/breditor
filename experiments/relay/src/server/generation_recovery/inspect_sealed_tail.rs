//! Authenticate a sealed restart inspection with an incomplete final Native frame.
use super::{
    SealedNativeRestartBootstrap, ServerLogGenerationRecoveryState,
    reopen_sealed_restart::reopen_retained_seal,
};
use crate::{
    Error, OperationalLogGenerationServerRoom, Result, ServerLogGenerationRoomBackup,
    server::Authentication,
};

/// Detached complete recovery state and the exact incomplete suffix from the held active WAL.
pub struct SealedNativeTailInspection {
    /// Complete surviving archive and the Native registration inventory at the same cut.
    pub state: ServerLogGenerationRecoveryState,
    /// Length of the incomplete suffix still in the original log.
    pub incomplete_bytes: u64,
    /// SHA-256 of the exact incomplete suffix.
    pub incomplete_sha256: [u8; 32],
    suffix: Vec<u8>,
}

impl SealedNativeTailInspection {
    /// Bytes to retain independently alongside the complete archive for later recovery.
    #[must_use]
    pub fn incomplete_suffix(&self) -> &[u8] {
        &self.suffix
    }
}

/// Inspect a sealed operational room after a write stopped inside its last active frame.
/// Fresh authentication, the original operational owner, current deployment epoch and complete
/// ancestry are required. A prepared epoch can only inspect the original selected cut.
/// A committed epoch may expose later acknowledged work above the independently retained floor.
///
/// The returned state and suffix are detached. Inspection leaves the original files in place.
/// # Errors
/// Invalid authentication, changed ownership or epoch, mismatched retained floor, complete or
/// corrupt active logs, incomplete rotation or upload, or failed Native replay refuse.
pub async fn inspect_sealed_native_tail(
    bootstrap: SealedNativeRestartBootstrap,
    minimum: Option<ServerLogGenerationRoomBackup>,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<SealedNativeTailInspection> {
    authentication.authenticate(principal, token)?;
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let (source, selection, operating_directory) = reopen_retained_seal(bootstrap)?;
        selection.check_checkpoint()?;
        let minimum = selection.inspection_minimum(minimum.as_ref())?;
        let origin = source.source_backup().info()?.identity;
        OperationalLogGenerationServerRoom::with_committed_native_tail(
            &operating_directory,
            source.source_backup(),
            &origin,
            minimum,
            &principal,
            |captured| {
                let state = ServerLogGenerationRecoveryState {
                    origin: origin.clone(),
                    server: captured.inspected.backup,
                    participants: captured.participants,
                };
                selection.check_inspected_current(&state)?;
                selection.check_operational_archive(captured.operation, &state.server)?;
                Ok(SealedNativeTailInspection {
                    state,
                    incomplete_bytes: captured.inspected.incomplete_bytes,
                    incomplete_sha256: captured.inspected.incomplete_sha256,
                    suffix: captured.suffix,
                })
            },
        )
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
