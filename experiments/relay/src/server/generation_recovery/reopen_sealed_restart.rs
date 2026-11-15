//! Reacquire sealed restart custody from independently retained host inputs.
use super::{
    NativeGenerationActivationCheckpointStatus as Status, PreparedLogGenerationRecoveryHost,
    PreparedNativeGenerationActivation, PreparedNativeGenerationActivationIdentity,
    SealedNativeRestartHostCoverage, SealedNativeRestartSelection,
    ServerLogGenerationRecoveryStateIdentity, VerifiedServerLogGenerationRecoveryState,
    open_sealed_native_restart_host,
};
use crate::{
    Error, MissingRecoveryRegistration, RecoveryRegistrationCredentials, Result,
    server::{Authentication, PreparedLogGenerationHandover, RoomDeploymentAuthority},
};
use std::{path::PathBuf, sync::Arc};

/// Host-chosen locations and independently retained identities for a cold restart.
pub struct SealedNativeRestartBootstrap {
    /// Existing sealed source handover directory.
    pub source_root: PathBuf,
    /// Existing Native checkpoint directory.
    pub checkpoint_root: PathBuf,
    /// Existing deployment authority directory.
    pub authority_root: PathBuf,
    /// Existing committed operational room directory.
    pub operational_root: PathBuf,
    /// Exact checkpoint identity retained independently of its local files.
    pub expected_checkpoint: PreparedNativeGenerationActivationIdentity,
    /// Independently retained room and protected-stream selection. Restart
    /// requires this exact cut. Inspection uses it as the minimum cut.
    pub expected_current: ServerLogGenerationRecoveryStateIdentity,
}

/// Actual reopened custody retained together for later explicit recovery actions.
pub struct ReopenedSealedNativeRestartHost {
    /// Inactive room and raster owner.
    pub host: PreparedLogGenerationRecoveryHost,
    /// Fresh complete verification for this exact room owner.
    pub proof: VerifiedServerLogGenerationRecoveryState,
    /// Reopened original source seal.
    pub source: Arc<PreparedLogGenerationHandover>,
    /// Reopened selected checkpoint.
    pub checkpoint: Arc<PreparedNativeGenerationActivation>,
    /// Actual deployment authority for a subsequent explicit activation.
    pub authority: RoomDeploymentAuthority,
    /// Whether the selected checkpoint is prepared or committed.
    pub status: Status,
}

/// Coverage of a complete cold startup from independently retained host inputs.
#[allow(
    clippy::large_enum_variant,
    reason = "Preserve the public shape of verified restart custody"
)]
pub enum SealedNativeRestartBootstrapCoverage {
    /// All protected streams match, and the reopened custody is still held.
    Verified(ReopenedSealedNativeRestartHost),
    /// Missing protected inputs. All resources opened by this call were released.
    Pending {
        /// Protected document or comment registrations still needed.
        missing: Vec<MissingRecoveryRegistration>,
    },
}

/// Reopen a sealed restart from existing host-selected locations and exact pins.
/// The actual authority resolves whether the selected checkpoint committed. A
/// prepared epoch requires its original current cut. A committed epoch can
/// select a separately retained descendant. Successful admission keeps the
/// room inactive until the host explicitly activates and publishes it.
/// # Errors
/// Wrong authentication, stale or superseded epochs, changed files or
/// custody, incorrect credentials, or unverifiable state refuse. This
/// operation does not repair files or create a serving lease.
pub async fn reopen_sealed_native_restart_host(
    bootstrap: SealedNativeRestartBootstrap,
    authentication: Authentication,
    principal: &str,
    token: &str,
    supplied: RecoveryRegistrationCredentials,
) -> Result<SealedNativeRestartBootstrapCoverage> {
    authentication.authenticate(principal, token)?;
    let (source, selection, operational_root) =
        tokio::task::spawn_blocking(move || reopen_retained_seal(bootstrap))
            .await
            .map_err(|_| Error::NeedsRecovery)??;
    let checkpoint = selection.checkpoint.clone();
    let authority = selection.authority.clone();
    let status = selection.status;
    let coverage = Box::pin(open_sealed_native_restart_host(
        &operational_root,
        authentication,
        principal,
        token,
        selection,
        supplied,
    ))
    .await?;
    Ok(match coverage {
        SealedNativeRestartHostCoverage::Verified { host, proof } => {
            SealedNativeRestartBootstrapCoverage::Verified(ReopenedSealedNativeRestartHost {
                host,
                proof,
                source,
                checkpoint,
                authority,
                status,
            })
        }
        SealedNativeRestartHostCoverage::Pending { missing } => {
            SealedNativeRestartBootstrapCoverage::Pending { missing }
        }
    })
}

pub(super) fn reopen_retained_seal(
    bootstrap: SealedNativeRestartBootstrap,
) -> Result<(Arc<PreparedLogGenerationHandover>, SealedNativeRestartSelection, PathBuf)> {
    let expected = bootstrap.expected_checkpoint;
    let authority = RoomDeploymentAuthority::open_at_least(
        &bootstrap.authority_root,
        expected.previous_selection(),
    )?;
    let source =
        Arc::new(PreparedLogGenerationHandover::open(&bootstrap.source_root, expected.source())?);
    let checkpoint = Arc::new(PreparedNativeGenerationActivation::open(
        &bootstrap.checkpoint_root,
        &expected,
        source.clone(),
    )?);
    let status = checkpoint.status(&authority)?;
    if status == Status::Superseded {
        return Err(Error::Lease);
    }
    let selection = SealedNativeRestartSelection {
        checkpoint,
        authority,
        status,
        expected: bootstrap.expected_current,
    };
    Ok((source, selection, bootstrap.operational_root))
}
