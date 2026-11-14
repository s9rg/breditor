//! Prepare a separate physical host without rewriting any original local origin marker.
use super::super::PreparedLogGenerationRecoveryHost;
use super::{PreparedPhysicalRoomRecoveryHost, selected::check_retained};
use crate::{Error, Result, ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity};
use std::sync::Arc;

/// Retain actual local native/raster custody and an independently selected complete ancestor.
/// The older original API keeps local origin B even when ancestor A is older. No route, writer,
/// file, role, credential, repair or activation is created. Failure drops only the supplied handles.
/// # Errors
/// Wrong current authentication/non-owner, wrong A/B selections, foreign/nonretained prefix,
/// missing original rasters, changed local controls or uncertain actual storage refuses.
pub async fn prepare_physical_room_recovery_host(
    local: PreparedLogGenerationRecoveryHost,
    ancestor: ServerLogGenerationRoomBackup,
    expected_ancestor: &ServerLogGenerationRoomBackupIdentity,
    expected_local_origin: &ServerLogGenerationRoomBackupIdentity,
    principal: &str,
    token: &str,
) -> Result<PreparedPhysicalRoomRecoveryHost> {
    local.host.authentication.authenticate(principal, token)?;
    if ancestor.info()?.identity != *expected_ancestor
        || *local.original.identity()? != *expected_local_origin
    {
        return Err(Error::Contract("physical host selected ancestor/local origin differs"));
    }
    let ancestor = Arc::new(ancestor);
    let retained = ancestor.clone();
    let original = local.original.clone();
    let custody = local
        .host
        .generation_custody
        .clone()
        .ok_or(Error::Contract("physical host actual local custody absent"))?;
    let assets =
        local.host.assets.clone().ok_or(Error::Contract("physical host actual rasters absent"))?;
    let owner = principal.to_owned();
    local
        .host
        .transaction(move |room| {
            // Full immutable A->B admission is blocking bounded work, not async I/O work.
            // Two archives separately retained in C do not establish their order.
            original.check_archive_ancestor(&retained)?;
            let mut assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
            check_retained(room, &mut assets, &original, &retained, &custody, &owner)
        })
        .await?;
    Ok(PreparedPhysicalRoomRecoveryHost { local, ancestor })
}
