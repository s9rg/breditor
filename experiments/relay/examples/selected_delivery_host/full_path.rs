//! Exercise the PUBLIC native complete-path API on the actual activated service.
//! Returned JSON is test evidence only, never a client/writer or portable proof.
use super::{Result, setup::Ready};
use breditor_collab_relay::{
    ServerLogGenerationRoomBackup,
    server::{ServerLogGenerationDeliveryPathIdentity, VerifiedServerLogGenerationRecoveryState},
};
use std::{collections::BTreeMap, sync::Arc};
fn copy(value: &ServerLogGenerationRoomBackup) -> Result<ServerLogGenerationRoomBackup> {
    Ok(ServerLogGenerationRoomBackup::from_owned_bytes(value.to_bytes()?)?)
}
pub(super) async fn verify(
    ready: &Ready,
    current: &ServerLogGenerationRoomBackup,
    native: Arc<VerifiedServerLogGenerationRecoveryState>,
    observed: &BTreeMap<u64, Arc<ServerLogGenerationRoomBackup>>,
) -> Result<ServerLogGenerationDeliveryPathIdentity> {
    let path = if observed.is_empty() {
        vec![copy(current)?]
    } else {
        observed.values().map(|value| copy(value)).collect::<Result<Vec<_>>>()?
    };
    let pins = path
        .iter()
        .map(|value| value.info().map(|info| info.identity))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let host = ready.active.recovery_host();
    let proof = host.verify_delivery_path("owner", &ready.owner_token, path, &pins, native).await?;
    proof.check_live(&host, "owner", &ready.owner_token).await?;
    Ok(proof.identity())
}
