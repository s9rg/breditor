//! Keep every selected recovery component and describe the bytes an operator can pin.
use super::{
    Result,
    destination::{Destination, EvidenceDirectory, FilePin},
    request::Mode,
    selection::{PendingWrites, RasterPin, RotationPin, Selection},
};
use breditor_collab_relay::{
    ServerLogGenerationRoomBackup,
    assets::PendingRasterUpload,
    server::{
        Authentication, PendingNativeLogRotation, SealedNativeRasterUploadInspection,
        SealedNativeRestartBootstrap, SealedNativeRotationAndRasterInspection,
        SealedNativeRotationInspection, SealedNativeTailAndRasterInspection,
        SealedNativeTailInspection, ServerLogGenerationRecoveryState,
        inspect_sealed_native_raster_upload, inspect_sealed_native_restart,
        inspect_sealed_native_rotation, inspect_sealed_native_rotation_and_raster,
        inspect_sealed_native_tail, inspect_sealed_native_tail_and_raster,
    },
};

pub(super) enum Observation {
    Complete(ServerLogGenerationRecoveryState),
    NativeTail(SealedNativeTailInspection),
    RasterUpload(SealedNativeRasterUploadInspection),
    Rotation(SealedNativeRotationInspection),
    NativeTailAndRaster(SealedNativeTailAndRasterInspection),
    RotationAndRaster(SealedNativeRotationAndRasterInspection),
}

impl Observation {
    pub(super) async fn capture(
        mode: Mode,
        bootstrap: SealedNativeRestartBootstrap,
        floor: Option<ServerLogGenerationRoomBackup>,
        auth: Authentication,
        principal: &str,
        token: &str,
    ) -> Result<Self> {
        Ok(match mode {
            Mode::Complete => Self::Complete(
                Box::pin(inspect_sealed_native_restart(bootstrap, floor, auth, principal, token))
                    .await?,
            ),
            Mode::NativeTail => Self::NativeTail(
                Box::pin(inspect_sealed_native_tail(bootstrap, floor, auth, principal, token))
                    .await?,
            ),
            Mode::RasterUpload => Self::RasterUpload(
                Box::pin(inspect_sealed_native_raster_upload(
                    bootstrap, floor, auth, principal, token,
                ))
                .await?,
            ),
            Mode::Rotation => Self::Rotation(
                Box::pin(inspect_sealed_native_rotation(bootstrap, floor, auth, principal, token))
                    .await?,
            ),
            Mode::NativeTailAndRaster => Self::NativeTailAndRaster(
                Box::pin(inspect_sealed_native_tail_and_raster(
                    bootstrap, floor, auth, principal, token,
                ))
                .await?,
            ),
            Mode::RotationAndRaster => Self::RotationAndRaster(
                Box::pin(inspect_sealed_native_rotation_and_raster(
                    bootstrap, floor, auth, principal, token,
                ))
                .await?,
            ),
        })
    }

    pub(super) fn retain(self, destination: Destination) -> Result {
        let output = destination.create()?;
        let mut pending = PendingWrites::default();
        let (state, mode) = match self {
            Self::Complete(state) => (state, Mode::Complete),
            Self::NativeTail(observed) => {
                pending.wal_suffix = Some(write_tail(&output, &observed)?);
                (observed.state, Mode::NativeTail)
            }
            Self::RasterUpload(observed) => {
                pending.raster_stage = Some(write_raster(&output, &observed.upload)?);
                (observed.state, Mode::RasterUpload)
            }
            Self::Rotation(observed) => {
                pending.rotation = Some(write_rotation(&output, &observed.rotation)?);
                (observed.state, Mode::Rotation)
            }
            Self::NativeTailAndRaster(observed) => {
                pending.wal_suffix = Some(write_tail(&output, &observed.tail)?);
                pending.raster_stage = Some(write_raster(&output, &observed.upload)?);
                (observed.tail.state, Mode::NativeTailAndRaster)
            }
            Self::RotationAndRaster(observed) => {
                pending.rotation = Some(write_rotation(&output, &observed.log.rotation)?);
                pending.raster_stage = Some(write_raster(&output, &observed.upload)?);
                (observed.log.state, Mode::RotationAndRaster)
            }
        };
        let current = state.identity()?;
        let (archive, participants) = state.into_parts();
        let info = archive.info()?;
        let archive =
            output.write("room.backup", info.bytes, info.identity.archive_sha256, |file| {
                archive.write_to(file)?;
                Ok(())
            })?;
        let participants =
            output.write_bytes("participants.json", participants.to_json().as_bytes())?;
        output.finish(&serde_json::to_vec(&Selection {
            format: "breditor/sealed-room-inspection".into(),
            format_version: 1,
            mode,
            current,
            archive,
            participants,
            pending,
        })?)
    }
}

fn write_tail(
    output: &EvidenceDirectory,
    observed: &SealedNativeTailInspection,
) -> Result<FilePin> {
    output.write("wal-suffix.bin", observed.incomplete_bytes, observed.incomplete_sha256, |file| {
        std::io::Write::write_all(file, observed.incomplete_suffix())?;
        Ok(())
    })
}

fn write_rotation(
    output: &EvidenceDirectory,
    observed: &PendingNativeLogRotation,
) -> Result<RotationPin> {
    let bytes = observed.evidence_bytes();
    let evidence =
        output.write("rotation.json", bytes.len() as u64, observed.evidence_sha256, |file| {
            std::io::Write::write_all(file, bytes)?;
            Ok(())
        })?;
    Ok(RotationPin {
        evidence,
        planned_manifest: observed.after_manifest,
        head_published: observed.head_published,
    })
}

fn write_raster(output: &EvidenceDirectory, observed: &PendingRasterUpload) -> Result<RasterPin> {
    let evidence =
        output.write("raster-stage.bin", observed.bytes, observed.evidence_sha256, |file| {
            std::io::Write::write_all(file, observed.evidence_bytes())?;
            Ok(())
        })?;
    Ok(RasterPin {
        evidence,
        selection_sha256: observed.selection_sha256,
        published_asset: observed.published_asset.clone(),
    })
}
