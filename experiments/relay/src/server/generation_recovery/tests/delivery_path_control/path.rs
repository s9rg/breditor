//! Actual ordered predecessor proof for the real control fixture; no metadata authority.
use super::super::source::TestResult;
use crate::{
    ServerLogGenerationRoomBackup,
    server::{
        PreparedLogGenerationRecoveryHost, VerifiedServerLogGenerationDeliveryPath,
        VerifiedServerLogGenerationRecoveryState,
    },
};
use std::sync::Arc;
pub(super) async fn verify(
    host: &PreparedLogGenerationRecoveryHost,
    owner: &str,
    previous: &ServerLogGenerationRoomBackup,
    middle: &ServerLogGenerationRoomBackup,
    native: Arc<VerifiedServerLogGenerationRecoveryState>,
) -> TestResult<Arc<VerifiedServerLogGenerationDeliveryPath>> {
    let ancestors = vec![
        ServerLogGenerationRoomBackup::from_owned_bytes(previous.to_bytes()?)?,
        ServerLogGenerationRoomBackup::from_owned_bytes(middle.to_bytes()?)?,
    ];
    let pins = ancestors
        .iter()
        .map(|value| value.info().map(|info| info.identity))
        .collect::<crate::Result<Vec<_>>>()?;
    Ok(Arc::new(host.verify_delivery_path("owner", owner, ancestors, &pins, native).await?))
}
