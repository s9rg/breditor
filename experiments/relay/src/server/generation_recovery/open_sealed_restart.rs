//! Existing-only host startup for a sealed Native restart.
use super::{
    PreparedLogGenerationRecoveryHost, SealedNativeRestartSelection,
    ServerLogGenerationRecoveryCoverage, VerifiedServerLogGenerationRecoveryState,
    prepare_log_generation_recovery_host_file,
};
use crate::{
    Error, MissingRecoveryRegistration, OperationalLogGenerationServerRoom,
    RecoveryRegistrationCredentials, Result, RoomRecoveryPolicy, server::Authentication,
};
use std::path::Path;

/// Result of reopening and verifying the exact committed operational room.
pub enum SealedNativeRestartHostCoverage {
    /// The original operational custody and a fresh proof for this host.
    Verified {
        /// Inactive host whose room and raster owners are still held.
        host: PreparedLogGenerationRecoveryHost,
        /// Verified complete current cut and all protected registrations.
        proof: VerifiedServerLogGenerationRecoveryState,
    },
    /// Missing protected credentials. The attempted open released its custody.
    Pending {
        /// Document or comment resume records still needed for verification.
        missing: Vec<MissingRecoveryRegistration>,
    },
}

/// Open the exact existing operational target of a sealed checkpoint. Host
/// credentials and the retained current cut are supplied separately. A
/// verified result keeps the room inactive for explicit activation and
/// publication. Pending or refused admission preserves the original marker
/// files and releases any operational custody it acquired.
///
/// # Errors
/// Invalid authentication, an incomplete operational handoff, stale selection,
/// changed ownership or unverifiable archive/registration data refuse.
pub async fn open_sealed_native_restart_host(
    root: &Path,
    authentication: Authentication,
    principal: &str,
    token: &str,
    selection: SealedNativeRestartSelection,
    supplied: RecoveryRegistrationCredentials,
) -> Result<SealedNativeRestartHostCoverage> {
    let (host, selection) = Box::pin(open_sealed_native_restart_target(
        root,
        authentication,
        principal,
        token,
        selection,
    ))
    .await?;
    let coverage = host.verify_sealed_native_restart(principal, token, selection, supplied).await?;
    Ok(match coverage {
        ServerLogGenerationRecoveryCoverage::Verified(proof) => {
            SealedNativeRestartHostCoverage::Verified { host, proof }
        }
        ServerLogGenerationRecoveryCoverage::Pending { missing } => {
            SealedNativeRestartHostCoverage::Pending { missing }
        }
    })
}

pub(super) async fn open_sealed_native_restart_target(
    root: &Path,
    authentication: Authentication,
    principal: &str,
    token: &str,
    selection: SealedNativeRestartSelection,
) -> Result<(PreparedLogGenerationRecoveryHost, SealedNativeRestartSelection)> {
    authentication.authenticate(principal, token)?;
    let root = root.to_owned();
    let owner = principal.to_owned();
    let (operational, original, origin, selection) = tokio::task::spawn_blocking(move || {
        selection.check_checkpoint()?;
        let original = selection.checkpoint.source.open_source_backup_file()?;
        let origin = selection.expected.origin.clone();
        let operational = OperationalLogGenerationServerRoom::open_committed_file(
            &root,
            &original,
            &origin,
            RoomRecoveryPolicy::HostReacquired,
            &owner,
        )?;
        Ok::<_, Error>((Box::new(operational), original, origin, selection))
    })
    .await
    .map_err(|_| Error::NeedsRecovery)??;
    let host = Box::pin(prepare_log_generation_recovery_host_file(
        *operational,
        authentication,
        original,
        &origin,
        principal,
        token,
    ))
    .await?;
    Ok((host, selection))
}
