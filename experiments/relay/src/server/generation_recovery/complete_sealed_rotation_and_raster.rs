//! Complete the exact inspected rotation and retire the stage under the same held epoch.
use super::{
    SealedNativeRestartBootstrap, SealedNativeRotationCompletionFiles,
    ServerLogGenerationRecoveryState,
    complete_sealed_rotation::{
        RetainedRasterStage, RotationCompletionInterruption, complete_rotation,
    },
};
use crate::{Result, server::Authentication};
use std::path::PathBuf;

/// Independently retained files from a sealed rotation and raster inspection.
pub struct SealedNativeRotationAndRasterCompletionFiles {
    /// Exact inspected room archive and rotation evidence.
    pub rotation: SealedNativeRotationCompletionFiles,
    /// Exact raster staging bytes in another private file outside the operating directory.
    pub raster_stage: PathBuf,
    /// Pin binding the staged bytes to the original inode and publication state.
    pub raster_selection_sha256: [u8; 32],
}

/// Finish the selected physical rotation and retire the exact raster stage in a committed room.
///
/// Supply the inspected cut in the bootstrap and independently retain all three files. The
/// relay verifies and synchronizes the evidence before completing the rotation. It checks the
/// exact intended head and preserved Native history before retiring the staging name. Any
/// published raster stays at its original inode and unpublished bytes remain in the evidence.
///
/// After an interruption with both operations pending, re-inspect the new phase and retain
/// its evidence before retrying. If the rotation intent is gone, use raster-only inspection
/// and retirement against the retained floor and verify the planned manifest. If both are
/// gone, use ordinary sealed restart inspection.
///
/// # Errors
/// Invalid authentication, prepared or stale epochs, changed custody, missing or divergent
/// operations or retained evidence, or uncertain writes refuse.
pub async fn complete_sealed_native_rotation_and_raster(
    bootstrap: SealedNativeRestartBootstrap,
    retained: SealedNativeRotationAndRasterCompletionFiles,
    authentication: Authentication,
    principal: &str,
    token: &str,
) -> Result<ServerLogGenerationRecoveryState> {
    complete_sealed_native_rotation_and_raster_with_interruption(
        bootstrap,
        retained,
        authentication,
        principal,
        token,
        RotationCompletionInterruption::default(),
    )
    .await
}

pub(in crate::server) async fn complete_sealed_native_rotation_and_raster_with_interruption(
    bootstrap: SealedNativeRestartBootstrap,
    retained: SealedNativeRotationAndRasterCompletionFiles,
    authentication: Authentication,
    principal: &str,
    token: &str,
    interruption: RotationCompletionInterruption,
) -> Result<ServerLogGenerationRecoveryState> {
    complete_rotation(
        bootstrap,
        retained.rotation,
        Some(RetainedRasterStage {
            path: retained.raster_stage,
            selection_sha256: retained.raster_selection_sha256,
        }),
        authentication,
        principal,
        token,
        interruption,
    )
    .await
}
