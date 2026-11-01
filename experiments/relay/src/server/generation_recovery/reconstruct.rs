//! Explicit absent-only Native replay and authenticated inactive host preparation.
use super::{PreparedLogGenerationRecoveryHost, prepare_log_generation_recovery_host};
use crate::{
    Error, Result, RoomRecoveryPolicy, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupIdentity, ServerLogGenerationRoomRecovery, server::Authentication,
};
use std::path::Path;

/// Replay a separately selected complete archive into an absent private directory and
/// transfer all actual Native/raster locks into an authenticated, inactive host.
///
/// Current host authentication and the selected owner are checked before target IO.
/// Original protocol/roles/registrations/bytes remain unchanged; old connection leases
/// and account tokens are not revived. This creates no router, deployment lease,
/// editor service, client writer or activation permission. Retain the archive and
/// independent identity for explicit operational resume after interruption.
///
/// Blocking replay runs on a worker which retains ownership until its result is
/// consumed or dropped. Dropping this future does not cancel already running IO.
/// All durable files remain on failure; an existing directory is never adopted,
/// overwritten, repaired or automatically removed.
///
/// # Errors
/// Wrong current credentials/non-owner, different archive selection, occupied or
/// uncertain paths, failed Native/raster replay, changed custody or IO refuse.
pub async fn reconstruct_log_generation_recovery_host(
    target: &Path,
    authentication: Authentication,
    original: ServerLogGenerationRoomBackup,
    expected: &ServerLogGenerationRoomBackupIdentity,
    principal: &str,
    token: &str,
) -> Result<PreparedLogGenerationRecoveryHost> {
    authentication.authenticate(principal, token)?;
    if principal != expected.native.source.owner {
        return Err(Error::Permission);
    }
    if original.info()?.identity != *expected {
        return Err(Error::Contract("reconstructed host independently selected archive differs"));
    }
    let path = target.to_owned();
    let selected = expected.clone();
    let owner = principal.to_owned();
    let (operational, original) = tokio::task::spawn_blocking(move || {
        let recovered = ServerLogGenerationRoomRecovery::begin(
            &path,
            &original,
            &selected,
            RoomRecoveryPolicy::HostReacquired,
        )?
        .finish(&original)?;
        let operational = recovered.begin_operation(
            &original,
            &selected,
            RoomRecoveryPolicy::HostReacquired,
            &owner,
        )?;
        Ok::<_, Error>((operational, original))
    })
    .await
    .map_err(|_| Error::NeedsRecovery)??;
    Box::pin(prepare_log_generation_recovery_host(
        operational,
        authentication,
        original,
        expected,
        principal,
        token,
    ))
    .await
}
