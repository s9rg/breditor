//! Dispatch the approved mode to the existing authenticated sealed repair operations.
use super::Result;
use breditor_collab_relay::server::{
    Authentication, SealedNativeRasterUploadRecoveryFiles, SealedNativeRestartBootstrap,
    SealedNativeRotationAndRasterCompletionFiles, SealedNativeRotationCompletionFiles,
    SealedNativeTailAndRasterRepairFiles, SealedNativeTailRepairFiles,
    ServerLogGenerationRecoveryState, complete_sealed_native_rotation,
    complete_sealed_native_rotation_and_raster, repair_sealed_native_tail,
    repair_sealed_native_tail_and_raster, retire_sealed_native_raster_upload,
};

pub(super) enum Repair {
    NativeTail(SealedNativeTailRepairFiles),
    RasterUpload(SealedNativeRasterUploadRecoveryFiles),
    Rotation(SealedNativeRotationCompletionFiles, [u8; 32]),
    NativeTailAndRaster(SealedNativeTailAndRasterRepairFiles),
    RotationAndRaster(SealedNativeRotationAndRasterCompletionFiles, [u8; 32]),
}

impl Repair {
    pub(super) fn planned_manifest(&self) -> Option<[u8; 32]> {
        match self {
            Self::Rotation(_, manifest) | Self::RotationAndRaster(_, manifest) => Some(*manifest),
            _ => None,
        }
    }

    pub(super) async fn apply(
        self,
        bootstrap: SealedNativeRestartBootstrap,
        auth: Authentication,
        principal: &str,
        token: &str,
    ) -> Result<Option<ServerLogGenerationRecoveryState>> {
        Ok(Some(match self {
            Self::NativeTail(files) => {
                Box::pin(repair_sealed_native_tail(bootstrap, files, auth, principal, token))
                    .await?;
                return Ok(None);
            }
            Self::RasterUpload(files) => {
                Box::pin(retire_sealed_native_raster_upload(
                    bootstrap, files, auth, principal, token,
                ))
                .await?
            }
            Self::Rotation(files, _) => {
                Box::pin(complete_sealed_native_rotation(bootstrap, files, auth, principal, token))
                    .await?
            }
            Self::NativeTailAndRaster(files) => {
                Box::pin(repair_sealed_native_tail_and_raster(
                    bootstrap, files, auth, principal, token,
                ))
                .await?
            }
            Self::RotationAndRaster(files, _) => {
                Box::pin(complete_sealed_native_rotation_and_raster(
                    bootstrap, files, auth, principal, token,
                ))
                .await?
            }
        }))
    }
}
