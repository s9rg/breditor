//! Validate the independent selection and all retained bytes before repair can mutate storage.
use super::{
    super::{
        destination::FilePin,
        request::{Mode, read_regular},
        selection::{RasterPin, RotationPin, Selection},
    },
    Result,
    action::Repair,
};
use breditor_collab_relay::{
    MAX_GENERATION_PARTICIPANT_INVENTORY_BYTES, MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES,
    server::{
        SealedNativeRasterUploadRecoveryFiles, SealedNativeRotationAndRasterCompletionFiles,
        SealedNativeRotationCompletionFiles, SealedNativeTailAndRasterRepairFiles,
        SealedNativeTailRepairFiles, ServerLogGenerationRecoveryStateIdentity,
    },
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

// An envelope ceiling above the native per-kind limits enforced again by the repair APIs.
const MAX_PENDING_BYTES: u64 = 32 * 1024 * 1024;

pub(super) struct Bundle {
    pub(super) selection: Selection,
    pub(super) action: Repair,
}

impl Bundle {
    pub(super) fn open(
        directory: &Path,
        pin: &str,
        mode: Mode,
        expected: &ServerLogGenerationRecoveryStateIdentity,
    ) -> Result<Self> {
        let bytes = read_regular(&directory.join("selection.json"), 256 * 1024)?;
        check_selection_pin(&bytes, pin)?;
        let selection: Selection =
            serde_json::from_slice(&bytes).map_err(|_| "invalid retained sealed room selection")?;
        if selection.format != "breditor/sealed-room-inspection"
            || selection.format_version != 1
            || selection.mode != mode
            || &selection.current != expected
            || selection.archive.sha256 != expected.server.archive_sha256
            || selection.participants.sha256 != expected.participants.sha256
            || expected.participants.source != expected.server.native
        {
            return Err("retained selection differs from the approved repair".into());
        }
        let archive = selection.archive.verify(
            directory,
            "room.backup",
            MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES,
        )?;
        selection.participants.verify(
            directory,
            "participants.json",
            MAX_GENERATION_PARTICIPANT_INVENTORY_BYTES as u64,
        )?;
        let action = build_action(directory, &selection, archive)?;
        Ok(Self { selection, action })
    }
}

fn check_selection_pin(bytes: &[u8], pin: &str) -> Result {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    if pin.len() != 64
        || Sha256::digest(bytes)
            .iter()
            .zip(pin.as_bytes().as_chunks::<2>().0)
            .any(|(byte, pair)| *pair != [HEX[usize::from(byte >> 4)], HEX[usize::from(byte & 15)]])
    {
        return Err("retained selection SHA-256 differs from the independently approved pin".into());
    }
    Ok(())
}

fn build_action(directory: &Path, selection: &Selection, archive: PathBuf) -> Result<Repair> {
    let pending = &selection.pending;
    let manifest = selection.current.server.native.manifest;
    match (selection.mode, &pending.wal_suffix, &pending.rotation, &pending.raster_stage) {
        (Mode::NativeTail, Some(tail), None, None) => {
            Ok(Repair::NativeTail(tail_files(directory, archive, tail)?))
        }
        (Mode::RasterUpload, None, None, Some(stage)) => {
            Ok(Repair::RasterUpload(SealedNativeRasterUploadRecoveryFiles {
                archive,
                evidence: raster_file(directory, stage)?,
                selection_sha256: stage.selection_sha256,
            }))
        }
        (Mode::Rotation, None, Some(rotation), None) => Ok(Repair::Rotation(
            rotation_files(directory, archive, rotation, manifest)?,
            rotation.planned_manifest,
        )),
        (Mode::NativeTailAndRaster, Some(tail), None, Some(stage)) => {
            Ok(Repair::NativeTailAndRaster(SealedNativeTailAndRasterRepairFiles {
                tail: tail_files(directory, archive, tail)?,
                raster_stage: raster_file(directory, stage)?,
                raster_selection_sha256: stage.selection_sha256,
            }))
        }
        (Mode::RotationAndRaster, None, Some(rotation), Some(stage)) => {
            Ok(Repair::RotationAndRaster(
                SealedNativeRotationAndRasterCompletionFiles {
                    rotation: rotation_files(directory, archive, rotation, manifest)?,
                    raster_stage: raster_file(directory, stage)?,
                    raster_selection_sha256: stage.selection_sha256,
                },
                rotation.planned_manifest,
            ))
        }
        _ => Err("retained pending evidence does not match a repair mode".into()),
    }
}

fn tail_files(
    directory: &Path,
    archive: PathBuf,
    pin: &FilePin,
) -> Result<SealedNativeTailRepairFiles> {
    Ok(SealedNativeTailRepairFiles {
        archive,
        suffix: pin.verify(directory, "wal-suffix.bin", MAX_PENDING_BYTES)?,
        incomplete_bytes: pin.bytes,
        incomplete_sha256: pin.sha256,
    })
}

fn raster_file(directory: &Path, stage: &RasterPin) -> Result<PathBuf> {
    stage.evidence.verify(directory, "raster-stage.bin", MAX_PENDING_BYTES)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RotationEvidence {
    format: String,
    format_version: u32,
    selected_manifest: [u8; 32],
    files: BTreeMap<String, RotationPiece>,
}

#[derive(Deserialize)]
struct RotationPiece {
    bytes: Vec<u8>,
}

#[derive(Deserialize)]
struct RotationIntent {
    before: [u8; 32],
    after: [u8; 32],
}

fn rotation_files(
    directory: &Path,
    archive: PathBuf,
    rotation: &RotationPin,
    manifest: [u8; 32],
) -> Result<SealedNativeRotationCompletionFiles> {
    let evidence = rotation.evidence.verify(directory, "rotation.json", MAX_PENDING_BYTES)?;
    let bytes = read_regular(&evidence, rotation.evidence.bytes)?;
    if <[u8; 32]>::from(Sha256::digest(&bytes)) != rotation.evidence.sha256 {
        return Err("retained rotation evidence changed".into());
    }
    let observed: RotationEvidence = serde_json::from_slice(&bytes)?;
    let marker = observed.files.get(".rotation.json").ok_or("retained rotation marker missing")?;
    let intent: RotationIntent = serde_json::from_slice(&marker.bytes)?;
    if observed.format != "breditor/pending-native-log-rotation-evidence"
        || observed.format_version != 1
        || observed.selected_manifest != manifest
        || intent.after != rotation.planned_manifest
        || manifest != if rotation.head_published { intent.after } else { intent.before }
    {
        return Err("retained rotation selection disagrees with its intended manifest".into());
    }
    Ok(SealedNativeRotationCompletionFiles {
        archive,
        evidence,
        evidence_sha256: rotation.evidence.sha256,
    })
}
