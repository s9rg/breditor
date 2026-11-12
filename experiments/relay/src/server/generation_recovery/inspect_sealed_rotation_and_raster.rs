//! Read both interrupted operations at the same authenticated sealed-room cut.
use super::{
    SealedNativeRestartBootstrap, SealedNativeRotationInspection,
    inspect_sealed_rotation::inspect_rotation,
};
use crate::{
    Error, Result, ServerLogGenerationRoomBackup, assets::PendingRasterUpload,
    server::Authentication,
};

/// A selected room archive and independent evidence for a pending rotation and raster upload.
pub struct SealedNativeRotationAndRasterInspection {
    /// Selected archive, protected registrations and exact pending rotation evidence.
    pub log: SealedNativeRotationInspection,
    /// Exact raster stage and its observed publication state.
    pub upload: PendingRasterUpload,
}

/// Inspect a sealed room with an unfinished physical rotation and one interrupted raster upload.
///
/// Both observations use the original locked room and the same deployment epoch. Supply the
/// exact archive matching the bootstrap's floor as `minimum` if it is later than the checkpoint.
/// Retain the room archive, rotation evidence, raster bytes and their pins before repair.
///
/// # Errors
/// Refuses wrong authentication or epoch, changed custody, either operation absent, unverifiable
/// history, an incomplete Native frame, or multiple or unrelated raster stages.
pub async fn inspect_sealed_native_rotation_and_raster(
    bootstrap: SealedNativeRestartBootstrap,
    minimum: Option<ServerLogGenerationRoomBackup>,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<SealedNativeRotationAndRasterInspection> {
    let (log, upload) =
        inspect_rotation(bootstrap, minimum, authentication, principal, token, true).await?;
    let upload =
        upload.ok_or(Error::Contract("combined rotation inspection lacks raster evidence"))?;
    Ok(SealedNativeRotationAndRasterInspection { log, upload })
}
