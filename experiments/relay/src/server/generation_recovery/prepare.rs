//! Fresh host authentication precedes actual native/custody transfer. No route starts.
use super::super::{Authentication, create_host};
use super::PreparedLogGenerationRecoveryHost;
use crate::{
    Error, OperationalLogGenerationServerRoom, Result, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupFile, ServerLogGenerationRoomBackupIdentity, room::HostOrigin,
};
use std::sync::Arc;

/// Prepare an inactive host while transferring all actual locks without a release/reopen gap.
/// `expected` must be retained independently; authentication is current host configuration,
/// never the archive's former grants or a document/review resume secret. Retain the original
/// archive/selection separately for cold reopen. This does not construct a router or activate.
/// Blocking native/source checks run on a worker. Dropping this future does not cancel an
/// already running transfer; the worker retains all actual owners until its result is dropped.
/// # Errors
/// Wrong current token/non-owner, different original selection, changed controls/components,
/// missing original bytes or uncertain storage refuse. Failure drops ownership but preserves
/// all durable files for explicit operational resume; no files are recreated or repaired.
pub async fn prepare_log_generation_recovery_host(
    operational: OperationalLogGenerationServerRoom,
    authentication: Authentication,
    original: ServerLogGenerationRoomBackup,
    expected: &ServerLogGenerationRoomBackupIdentity,
    principal: &str,
    token: &str,
) -> Result<PreparedLogGenerationRecoveryHost> {
    prepare_selected_host(
        operational,
        authentication,
        HostOrigin::Buffered(Box::new(original)),
        expected,
        principal,
        token,
    )
    .await
}

/// Prepare the inactive authenticated host while retaining a previously admitted original file.
/// The host and serving clones retain the open handle and recheck its identity before use.
/// # Errors
/// Wrong current credentials, a changed file, missing original bytes, or uncertain custody refuses.
pub async fn prepare_log_generation_recovery_host_file(
    operational: OperationalLogGenerationServerRoom,
    authentication: Authentication,
    original: ServerLogGenerationRoomBackupFile,
    expected: &ServerLogGenerationRoomBackupIdentity,
    principal: &str,
    token: &str,
) -> Result<PreparedLogGenerationRecoveryHost> {
    prepare_selected_host(
        operational,
        authentication,
        HostOrigin::File(Box::new(original)),
        expected,
        principal,
        token,
    )
    .await
}

async fn prepare_selected_host(
    operational: OperationalLogGenerationServerRoom,
    authentication: Authentication,
    original: HostOrigin,
    expected: &ServerLogGenerationRoomBackupIdentity,
    principal: &str,
    token: &str,
) -> Result<PreparedLogGenerationRecoveryHost> {
    authentication.authenticate(principal, token)?;
    if original.identity()? != expected || operational.origin() != expected {
        return Err(Error::Contract("generation host selected original differs"));
    }
    let principal = principal.to_owned();
    tokio::task::spawn_blocking(move || {
        let (room, assets, custody) = operational.into_host_parts(&original, &principal)?;
        let mut host = create_host(room, authentication, Some(assets));
        host.generation_custody = Some(Arc::new(custody));
        Ok(PreparedLogGenerationRecoveryHost { host, original: Arc::new(original) })
    })
    .await
    .map_err(|_| Error::NeedsRecovery)?
}
