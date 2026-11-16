//! Recover one admitted rotation under the committed continued-room epoch.
use super::{evidence::Fingerprint, native_tail::with_repair_epoch};
use crate::{
    Error, Result,
    assets::{AssetBackupIdentity, PendingRasterUpload},
    log::generations::SelectedSegmentRotation,
    server::{
        Authentication, ContinuedRasterRestart, ContinuedRasterRoomBackupFiles,
        ContinuedRasterRoomBackupIdentity, RecoveredContinuedRasterRoom,
        RecoveredContinuedRasterRoomIdentity, RoomDeploymentSelection,
        generation_recovery::RetainedRepairFile,
    },
};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// A held decision for one observed phase of a physical continuation and its exact room cut.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContinuedRasterRotationPlan {
    format_version: u32,
    epoch: RoomDeploymentSelection,
    target: RecoveredContinuedRasterRoomIdentity,
    floor: ContinuedRasterRoomBackupIdentity,
    native: SelectedSegmentRotation,
    rasters: AssetBackupIdentity,
    rotation: Fingerprint,
    raster: Option<RasterEvidence>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RasterEvidence {
    selection: [u8; 32],
    staged: Fingerprint,
}

impl From<&PendingRasterUpload> for RasterEvidence {
    fn from(upload: &PendingRasterUpload) -> Self {
        Self {
            selection: upload.selection_sha256,
            staged: Fingerprint::of(upload.evidence_bytes()),
        }
    }
}

impl ContinuedRasterRotationPlan {
    /// Physical manifest that must select the empty intended continuation after repair.
    #[must_use]
    pub const fn successor_manifest(&self) -> [u8; 32] {
        self.native.after_manifest
    }

    /// The original absolute next event, preserved across physical rotation.
    #[must_use]
    pub const fn next_sequence(&self) -> u64 {
        self.native.records
    }
}

/// Select an independently retained floor and destination for read-only inspection.
pub struct ContinuedRasterRotationInspection<'a> {
    /// Committed approval and exact current serving epoch.
    pub restart: &'a ContinuedRasterRestart<'a>,
    /// Independently saved capture whose complete native prefix must be retained.
    pub minimum: &'a ContinuedRasterRoomBackupIdentity,
    /// Absent directory outside the room. Receives `rotation.json` and any `raster.bin`.
    pub evidence: &'a Path,
}

/// Apply one independently retained decision and its exact evidence.
pub struct ContinuedRasterRotationRepair<'a> {
    /// Committed approval and the same serving epoch used to inspect the operation.
    pub restart: &'a ContinuedRasterRestart<'a>,
    /// Exact plan returned by inspection.
    pub plan: &'a ContinuedRasterRotationPlan,
    /// Directory containing the preserved evidence files outside the original room.
    pub evidence: &'a Path,
}

/// Result of applying the inspected physical transition and any staged image retirement.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ContinuedRasterRotationRepairOutcome {
    /// Completed the inspected rotation, retired the inspected upload, or both.
    Repaired,
    /// Synchronized the same exact successor and image cut after an earlier completion.
    AlreadyComplete,
}

impl ContinuedRasterRoomBackupFiles {
    /// Inspect one durable rotation and, if present, one pending image under the same authority.
    /// Retain the output separately before repair. Run off asynchronous workers.
    ///
    /// # Errors
    /// Refuses a torn WAL, multiple pending stages, changed custody or floor, or an invalid epoch,
    /// owner, intent, phase or destination.
    pub fn inspect_activated_native_rotation(
        &self,
        path: &Path,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        selected: &ContinuedRasterRotationInspection<'_>,
    ) -> Result<ContinuedRasterRotationPlan> {
        authentication.authenticate(principal, token)?;
        with_repair_epoch(selected.restart, selected.minimum, || {
            let target =
                self.open_rotation_owner(path, principal, selected.restart, selected.minimum)?;
            let (native, rotation) = target
                .inspect_native_rotation()?
                .ok_or(Error::Contract("no continued native rotation to inspect"))?;
            let stage = target.pending_raster_upload()?;
            let rasters = target.rotation_raster_cut(stage.as_ref())?;
            target.preserve_rotation_evidence(selected.evidence, &rotation, stage.as_ref())?;
            self.check()?;
            Ok(ContinuedRasterRotationPlan {
                format_version: 1,
                target: target.identity().clone(),
                epoch: selected.restart.expected.clone(),
                floor: selected.minimum.clone(),
                native,
                rasters,
                rotation: Fingerprint::of(rotation.evidence_bytes()),
                raster: stage.as_ref().map(RasterEvidence::from),
            })
        })
    }

    /// Apply the exact selected rotation and retire any selected raster stage after native readback.
    /// If interrupted with a different phase still pending, re-inspect that phase and keep both
    /// plans. If the intent is already retired, the same plan checks the final manifest, successor
    /// inode and absolute event cut before completing any pending image retirement. Use the
    /// ordinary authenticated restart after completion. Run off asynchronous workers.
    ///
    /// # Errors
    /// Refuses altered evidence or a changed phase, consumed successor, changed cut or owner.
    pub fn repair_activated_native_rotation(
        &self,
        path: &Path,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        selected: &ContinuedRasterRotationRepair<'_>,
    ) -> Result<ContinuedRasterRotationRepairOutcome> {
        authentication.authenticate(principal, token)?;
        let plan = selected.plan;
        if plan.format_version != 1
            || &plan.target != selected.restart.approval.target()
            || &plan.epoch != selected.restart.expected
        {
            return Err(Error::Contract("invalid continued rotation recovery selection"));
        }
        with_repair_epoch(selected.restart, &plan.floor, || {
            let mut target =
                self.open_rotation_owner(path, principal, selected.restart, &plan.floor)?;
            let pending = target.inspect_native_rotation()?;
            if pending.as_ref().is_some_and(|(native, observed)| {
                native != &plan.native
                    || Fingerprint::of(observed.evidence_bytes()) != plan.rotation
            }) {
                return Err(Error::Contract("continued rotation phase or selection changed"));
            }
            let stage = target.pending_raster_upload()?;
            let observed = stage.as_ref().map(RasterEvidence::from);
            if (pending.is_some() || observed.is_some()) && observed != plan.raster {
                return Err(Error::Contract("continued rotation raster stage changed"));
            }
            if target.rotation_raster_cut(stage.as_ref())? != plan.rasters {
                return Err(Error::Contract("continued rotation accepted raster cut differs"));
            }
            let open = |name| {
                RetainedRepairFile::open(
                    &selected.evidence.join(name),
                    target.operating_directory(),
                    "continued rotation evidence must be outside the room",
                )
            };
            let rotation_file = open("rotation.json")?;
            let raster_file = plan
                .raster
                .as_ref()
                .map(|raster| {
                    let file = open("raster.bin")?;
                    raster
                        .staged
                        .sync_evidence(&file, "continued rotation raster evidence differs")?;
                    Ok::<_, Error>(file)
                })
                .transpose()?;
            plan.rotation.sync_evidence(&rotation_file, "continued rotation evidence differs")?;
            self.check()?;
            target.finish_rotation_repair(
                &plan.native,
                pending.as_ref().map(|(_, phase)| phase),
                &plan.rasters,
                stage.as_ref(),
                plan.raster.is_some(),
            )?;
            rotation_file.guard()?;
            if let Some(file) = raster_file {
                file.guard()?;
            }
            self.check()?;
            Ok(if pending.is_some() || stage.is_some() {
                ContinuedRasterRotationRepairOutcome::Repaired
            } else {
                ContinuedRasterRotationRepairOutcome::AlreadyComplete
            })
        })
    }

    fn open_rotation_owner(
        &self,
        path: &Path,
        principal: &str,
        restart: &ContinuedRasterRestart<'_>,
        minimum: &ContinuedRasterRoomBackupIdentity,
    ) -> Result<RecoveredContinuedRasterRoom> {
        let target = self.open_rotation_repair(
            path,
            restart.approval.target(),
            &minimum.native.predecessor.source,
        )?;
        target.room().recovery_inventory_owner(principal)?;
        restart.approval.check_target(&target)?;
        Ok(target)
    }
}
