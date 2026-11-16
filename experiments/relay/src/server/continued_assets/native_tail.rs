//! Authenticate a committed serving owner and repair only its independently inspected suffix.
use crate::{
    Error, Result,
    assets::AssetBackupIdentity,
    log::{
        MAX_GENERATION_INCOMPLETE_FRAME_BYTES,
        generations::{NativeTailRepairInterruption, SelectedNativeTailPrefix},
    },
    server::{
        Authentication, ContinuedRasterRestart, ContinuedRasterRoomBackupFiles,
        ContinuedRasterRoomBackupIdentity, RecoveredContinuedRasterRoom,
        RecoveredContinuedRasterRoomIdentity, RoomDeploymentSelection, deployment_fence,
        generation_recovery::RetainedRepairFile,
    },
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

/// Independent selection of the surviving native cut and exact incomplete bytes.
/// Retain this value separately from the room and the exported suffix before applying it.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContinuedRasterNativeTailPlan {
    format_version: u32,
    epoch: RoomDeploymentSelection,
    target: RecoveredContinuedRasterRoomIdentity,
    floor: ContinuedRasterRoomBackupIdentity,
    accepted: (SelectedNativeTailPrefix, AssetBackupIdentity),
    suffix_bytes: u64,
    suffix_sha256: [u8; 32],
}

impl ContinuedRasterNativeTailPlan {
    /// Original absolute next event at the surviving complete cut.
    #[must_use]
    pub const fn next_sequence(&self) -> u64 {
        self.accepted.0.records
    }

    /// Number of incomplete bytes retained outside the room.
    #[must_use]
    pub const fn incomplete_bytes(&self) -> u64 {
        self.suffix_bytes
    }
}

/// Independently selected minimum and destination for inspection of a committed relay.
pub struct ContinuedRasterNativeTailInspection<'a> {
    /// Same approval and exact current serving epoch used for a restart.
    pub restart: &'a ContinuedRasterRestart<'a>,
    /// Independently saved complete capture. The accepted prefix must retain this record cut.
    pub minimum: &'a ContinuedRasterRoomBackupIdentity,
    /// Absent private output directory outside the operating room. Receives `suffix.bin`.
    pub evidence: &'a Path,
}

/// Exact repair decision and its retained suffix under the same current epoch.
pub struct ContinuedRasterNativeTailRepair<'a> {
    /// Same approval and current serving epoch used to inspect this tail.
    pub restart: &'a ContinuedRasterRestart<'a>,
    /// Independently held decision from authenticated inspection.
    pub plan: &'a ContinuedRasterNativeTailPlan,
    /// Private regular `suffix.bin` outside the operating directory.
    pub suffix: &'a Path,
}

/// Outcome of synchronizing the same inspected complete native cut.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ContinuedRasterNativeTailOutcome {
    /// Removed the exact inspected incomplete suffix.
    Repaired,
    /// The same complete cut was already present and has been synchronized.
    AlreadyComplete,
}

impl ContinuedRasterRoomBackupFiles {
    /// Preserve the incomplete final bytes after authenticating and replaying the committed room.
    /// Keep the returned plan independently. Run off asynchronous I/O workers.
    ///
    /// # Errors
    /// Refuses a changed epoch, older or corrupt history, mismatched room or missing raster custody,
    /// a complete WAL, an unfinished rotation, and invalid evidence paths.
    pub fn inspect_activated_native_tail(
        &self,
        path: &Path,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        selected: &ContinuedRasterNativeTailInspection<'_>,
    ) -> Result<ContinuedRasterNativeTailPlan> {
        authentication.authenticate(principal, token)?;
        with_repair_epoch(selected.restart, selected.minimum, || {
            let mut target =
                self.inspect_native_owner(path, principal, selected.restart, selected.minimum)?;
            let accepted = target.native_tail_cut()?;
            let suffix = target.native_incomplete_suffix()?;
            if suffix.is_empty() {
                return Err(Error::Contract("no incomplete continued native tail to inspect"));
            }
            target.preserve_native_suffix(selected.evidence, &suffix)?;
            self.check()?;
            Ok(ContinuedRasterNativeTailPlan {
                format_version: 1,
                epoch: selected.restart.expected.clone(),
                target: target.identity().clone(),
                floor: selected.minimum.clone(),
                accepted,
                suffix_bytes: suffix.len() as u64,
                suffix_sha256: Sha256::digest(&suffix).into(),
            })
        })
    }

    /// Apply only the selected native suffix repair. Retain the evidence for any retry.
    /// After success, use the normal authenticated restart under the same retained epoch.
    ///
    /// # Errors
    /// Refuses changed plans, evidence, custody, accepted history, images, or epochs.
    pub fn repair_activated_native_tail(
        &self,
        path: &Path,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        selected: &ContinuedRasterNativeTailRepair<'_>,
    ) -> Result<ContinuedRasterNativeTailOutcome> {
        self.repair_native_tail(
            path,
            authentication,
            principal,
            token,
            selected,
            NativeTailRepairInterruption::default(),
        )
    }

    pub(in crate::server) fn repair_native_tail(
        &self,
        path: &Path,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        selected: &ContinuedRasterNativeTailRepair<'_>,
        stop: NativeTailRepairInterruption,
    ) -> Result<ContinuedRasterNativeTailOutcome> {
        authentication.authenticate(principal, token)?;
        let plan = selected.plan;
        if plan.format_version != 1
            || &plan.target != selected.restart.approval.target()
            || &plan.epoch != selected.restart.expected
            || plan.suffix_bytes == 0
            || plan.suffix_bytes > MAX_GENERATION_INCOMPLETE_FRAME_BYTES
        {
            return Err(Error::Contract("invalid continued native tail repair selection"));
        }
        with_repair_epoch(selected.restart, &plan.floor, || {
            let mut target =
                self.inspect_native_owner(path, principal, selected.restart, &plan.floor)?;
            if target.native_tail_cut()? != plan.accepted {
                return Err(Error::Contract("continued native tail repair cut differs"));
            }
            let evidence = RetainedRepairFile::open(
                selected.suffix,
                target.operating_directory(),
                "continued repair evidence must be outside the room",
            )?;
            let retained = evidence.read(plan.suffix_bytes)?;
            if retained.len() as u64 != plan.suffix_bytes
                || <[u8; 32]>::from(Sha256::digest(&retained)) != plan.suffix_sha256
            {
                return Err(Error::Contract("continued repair evidence differs"));
            }
            let suffix = target.native_incomplete_suffix()?;
            if !suffix.is_empty() && suffix != retained {
                return Err(Error::Contract("continued native tail changed after inspection"));
            }
            evidence.sync()?;
            self.check()?;
            target.finish_native_tail_repair(&plan.accepted, suffix.len() as u64, stop)?;
            evidence.guard()?;
            self.check()?;
            Ok(if suffix.is_empty() {
                ContinuedRasterNativeTailOutcome::AlreadyComplete
            } else {
                ContinuedRasterNativeTailOutcome::Repaired
            })
        })
    }

    fn inspect_native_owner(
        &self,
        path: &Path,
        principal: &str,
        restart: &ContinuedRasterRestart<'_>,
        minimum: &ContinuedRasterRoomBackupIdentity,
    ) -> Result<RecoveredContinuedRasterRoom> {
        let target = self.open_native_tail(
            path,
            restart.approval.target(),
            &minimum.native.predecessor.source,
        )?;
        target.room().recovery_inventory_owner(principal)?;
        restart.approval.check_target(&target)?;
        Ok(target)
    }
}

pub(super) fn with_repair_epoch<T>(
    restart: &ContinuedRasterRestart<'_>,
    minimum: &ContinuedRasterRoomBackupIdentity,
    inspect: impl FnOnce() -> Result<T>,
) -> Result<T> {
    minimum.check_selection()?;
    deployment_fence::inspect_retained_handover(
        restart.authority,
        &restart.approval.planned_selection()?,
        restart.expected,
        |epoch| restart.approval.restart_nonce(epoch),
        &minimum.source_epoch,
        inspect,
    )
}
