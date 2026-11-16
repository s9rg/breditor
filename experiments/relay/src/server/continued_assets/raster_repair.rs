//! Authenticate and retire one interrupted upload, preserving any complete published image.
use super::{evidence::Fingerprint, native_tail::with_repair_epoch};
use crate::{
    Error, Result,
    assets::{AssetBackupIdentity, MAX_STAGE_BYTES},
    log::{
        MAX_GENERATION_INCOMPLETE_FRAME_BYTES,
        generations::{NativeTailRepairInterruption, SelectedNativeTailPrefix},
    },
    server::{
        Authentication, ContinuedRasterRestart, ContinuedRasterRoomBackupFiles,
        ContinuedRasterRoomBackupIdentity, RecoveredContinuedRasterRoom,
        RecoveredContinuedRasterRoomIdentity, RoomDeploymentSelection,
        generation_recovery::RetainedRepairFile,
    },
};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Independent choice of an exact pending upload and accepted room cut.
/// Retain it separately from both the room and the exported evidence.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContinuedRasterUploadPlan {
    format_version: u32,
    epoch: RoomDeploymentSelection,
    target: RecoveredContinuedRasterRoomIdentity,
    floor: ContinuedRasterRoomBackupIdentity,
    accepted: (SelectedNativeTailPrefix, AssetBackupIdentity),
    stage_selection: [u8; 32],
    stage: Fingerprint,
    suffix: Fingerprint,
    published_asset: Option<String>,
}

impl ContinuedRasterUploadPlan {
    /// Asset that already has a final name on the staged inode, if publication reached that point.
    #[must_use]
    pub fn published_asset(&self) -> Option<&str> {
        self.published_asset.as_deref()
    }

    /// Bytes of the actual incomplete native suffix. Zero means a complete native WAL.
    #[must_use]
    pub const fn incomplete_native_bytes(&self) -> u64 {
        self.suffix.bytes
    }
}

/// Independent minimum and destination for authenticated upload inspection.
pub struct ContinuedRasterUploadInspection<'a> {
    /// Same approval and exact serving epoch used for a restart.
    pub restart: &'a ContinuedRasterRestart<'a>,
    /// Independently saved complete capture whose accepted native cut must be retained.
    pub minimum: &'a ContinuedRasterRoomBackupIdentity,
    /// Absent private directory outside the room. Receives `raster.bin` and `suffix.bin`.
    pub evidence: &'a Path,
}

/// Exact upload-recovery selection and the two independently retained evidence files.
pub struct ContinuedRasterUploadRepair<'a> {
    /// Same approval and serving epoch used to inspect the pending upload.
    pub restart: &'a ContinuedRasterRestart<'a>,
    /// Exact independent decision from inspection.
    pub plan: &'a ContinuedRasterUploadPlan,
    /// Preserved private staging bytes outside the room.
    pub raster: &'a Path,
    /// Preserved private native suffix outside the room, possibly empty.
    pub suffix: &'a Path,
}

/// Result of synchronizing the selected complete room and removing incomplete staging.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ContinuedRasterUploadRepairOutcome {
    /// Removed at least one of the exact inspected incomplete entries.
    Repaired,
    /// The same exact accepted state was already complete and has been synchronized.
    AlreadyComplete,
}

impl ContinuedRasterRoomBackupFiles {
    /// Preserve the interrupted upload and any incomplete native tail under the exact serving epoch.
    /// Retain the returned decision separately. Run this blocking operation off async workers.
    ///
    /// # Errors
    /// Refuses changed or older history, incomplete rotation, multiple staging files, unrelated
    /// links, invalid authentication or custody, and invalid output paths.
    pub fn inspect_activated_raster_upload(
        &self,
        path: &Path,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        selected: &ContinuedRasterUploadInspection<'_>,
    ) -> Result<ContinuedRasterUploadPlan> {
        authentication.authenticate(principal, token)?;
        with_repair_epoch(selected.restart, selected.minimum, || {
            let mut target =
                self.open_upload_repair_owner(path, principal, selected.restart, selected.minimum)?;
            let staged = target
                .pending_raster_upload()?
                .ok_or(Error::Contract("no continued pending raster upload to inspect"))?;
            let accepted = target.pending_raster_cut(Some(&staged))?;
            let suffix = target.native_incomplete_suffix()?;
            target.preserve_pending_raster_evidence(selected.evidence, &staged, &suffix)?;
            self.check()?;
            Ok(ContinuedRasterUploadPlan {
                format_version: 1,
                target: target.identity().clone(),
                epoch: selected.restart.expected.clone(),
                floor: selected.minimum.clone(),
                accepted,
                stage_selection: staged.selection_sha256,
                stage: Fingerprint::of(staged.evidence_bytes()),
                suffix: Fingerprint::of(&suffix),
                published_asset: staged.published_asset,
            })
        })
    }

    /// Repair the exact incomplete suffix and retire the exact staged upload.
    /// Keep both evidence files for retry. The original serving epoch stays current for restart.
    ///
    /// # Errors
    /// Refuses invalid authentication, replaced or older accepted history, changed staging,
    /// other pending work, or uncertainty about the retained evidence.
    pub fn repair_activated_raster_upload(
        &self,
        path: &Path,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        selected: &ContinuedRasterUploadRepair<'_>,
    ) -> Result<ContinuedRasterUploadRepairOutcome> {
        self.repair_raster_upload(
            path,
            authentication,
            principal,
            token,
            selected,
            NativeTailRepairInterruption::default(),
        )
    }

    pub(in crate::server) fn repair_raster_upload(
        &self,
        path: &Path,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        selected: &ContinuedRasterUploadRepair<'_>,
        stop: NativeTailRepairInterruption,
    ) -> Result<ContinuedRasterUploadRepairOutcome> {
        authentication.authenticate(principal, token)?;
        let plan = selected.plan;
        if plan.format_version != 1
            || &plan.target != selected.restart.approval.target()
            || &plan.epoch != selected.restart.expected
            || plan.stage.bytes > MAX_STAGE_BYTES
            || plan.suffix.bytes > MAX_GENERATION_INCOMPLETE_FRAME_BYTES
        {
            return Err(Error::Contract("invalid continued raster upload recovery selection"));
        }
        with_repair_epoch(selected.restart, &plan.floor, || {
            let mut target =
                self.open_upload_repair_owner(path, principal, selected.restart, &plan.floor)?;
            let staged = target.pending_raster_upload()?;
            if staged.as_ref().is_some_and(|file| file.selection_sha256 != plan.stage_selection) {
                return Err(Error::Contract("continued pending upload changed after inspection"));
            }
            if target.pending_raster_cut(staged.as_ref())? != plan.accepted {
                return Err(Error::Contract("continued upload recovery accepted cut differs"));
            }
            let suffix = target.native_incomplete_suffix()?;
            if !suffix.is_empty() && Fingerprint::of(&suffix) != plan.suffix {
                return Err(Error::Contract("continued native tail changed after inspection"));
            }
            let outside = "continued upload evidence must be outside the room";
            let upload_file =
                RetainedRepairFile::open(selected.raster, target.operating_directory(), outside)?;
            let suffix_file =
                RetainedRepairFile::open(selected.suffix, target.operating_directory(), outside)?;
            let changed = "continued upload recovery evidence differs";
            plan.stage.sync_evidence(&upload_file, changed)?;
            plan.suffix.sync_evidence(&suffix_file, changed)?;
            self.check()?;
            target.finish_pending_raster_repair(
                &plan.accepted,
                staged.as_ref(),
                suffix.len() as u64,
                stop,
            )?;
            upload_file.guard()?;
            suffix_file.guard()?;
            self.check()?;
            Ok(if staged.is_none() && suffix.is_empty() {
                ContinuedRasterUploadRepairOutcome::AlreadyComplete
            } else {
                ContinuedRasterUploadRepairOutcome::Repaired
            })
        })
    }

    fn open_upload_repair_owner(
        &self,
        path: &Path,
        principal: &str,
        restart: &ContinuedRasterRestart<'_>,
        minimum: &ContinuedRasterRoomBackupIdentity,
    ) -> Result<RecoveredContinuedRasterRoom> {
        let target = self.open_pending_raster_repair(
            path,
            restart.approval.target(),
            &minimum.native.predecessor.source,
        )?;
        target.room().recovery_inventory_owner(principal)?;
        restart.approval.check_target(&target)?;
        Ok(target)
    }
}
