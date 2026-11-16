//! Bind a separately persisted operator decision to the exact restored owner and verified inputs.
use crate::{
    Error, Result,
    archive_digest::ArchiveDigest,
    credentials,
    server::{
        ContinuedRasterRoomBackupIdentity, ContinuedRasterRoomInputReport,
        MAX_SERVER_ASSET_AVAILABILITY_BYTES, RecoveredContinuedRasterRoom,
        RecoveredContinuedRasterRoomIdentity, RoomDeploymentSelection,
        deployment_fence::handover_selection,
    },
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const FORMAT: &str = "breditor/continued-raster-room-activation";

/// Exact operator approval for one verified continued raster restoration.
/// Retain this value independently before attempting to commit the new serving epoch.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContinuedRasterActivationApproval {
    format: String,
    format_version: u32,
    salt: String,
    backup: ContinuedRasterRoomBackupIdentity,
    target: RecoveredContinuedRasterRoomIdentity,
    inputs_sha256: [u8; 32],
}

impl ContinuedRasterActivationApproval {
    /// Select one complete report and its original source epoch. Commit checks fresh live inputs.
    ///
    /// # Errors
    /// Refuses incomplete reports, invalid selections or unresolved epoch budgets.
    pub fn select(report: &ContinuedRasterRoomInputReport) -> Result<Self> {
        let approval = Self {
            format: FORMAT.into(),
            format_version: 1,
            salt: credentials::issue()?,
            backup: report.backup.clone(),
            target: report.target.clone(),
            inputs_sha256: input_digest(report)?,
        };
        approval.planned_selection()?;
        Ok(approval)
    }

    /// Binding to the local restore's separately retained completion pin.
    #[must_use]
    pub const fn target(&self) -> &RecoveredContinuedRasterRoomIdentity {
        &self.target
    }

    /// Expected first serving selection for diagnosis or resuming an interrupted reply.
    ///
    /// # Errors
    /// Refuses invalid approval fields, source cut or epoch budget.
    pub fn planned_selection(&self) -> Result<RoomDeploymentSelection> {
        handover_selection(self.previous(), &self.nonce()?)
    }

    pub(in crate::server) const fn previous(&self) -> &RoomDeploymentSelection {
        &self.backup.source_epoch
    }

    pub(in crate::server) fn check_target(
        &self,
        target: &RecoveredContinuedRasterRoom,
    ) -> Result<()> {
        if target.identity() != &self.target || target.activation_backup() != &self.backup {
            return Err(Error::Contract("continued raster activation target differs"));
        }
        Ok(())
    }

    pub(in crate::server) fn check_inputs(
        &self,
        report: &ContinuedRasterRoomInputReport,
    ) -> Result<()> {
        if input_digest(report)? != self.inputs_sha256 {
            return Err(Error::Contract("continued raster activation inputs changed"));
        }
        Ok(())
    }

    pub(in crate::server) fn nonce(&self) -> Result<[u8; 32]> {
        if self.format != FORMAT || self.format_version != 1 {
            return Err(Error::Contract("continued raster activation approval format"));
        }
        self.backup.check_selection()?;
        credentials::hash(&self.salt)?;
        Ok(Sha256::digest(serde_json::to_vec(self)?).into())
    }

    pub(in crate::server) fn restart_nonce(&self, epoch: u64) -> Result<[u8; 32]> {
        Ok(Sha256::digest(serde_json::to_vec(&(
            "breditor/continued-raster-room-restart/1",
            self.nonce()?,
            epoch,
        ))?)
        .into())
    }
}

fn input_digest(report: &ContinuedRasterRoomInputReport) -> Result<[u8; 32]> {
    if !report.inputs_complete() {
        return Err(Error::Contract("continued raster activation inputs incomplete"));
    }
    let mut digest = ArchiveDigest::new(MAX_SERVER_ASSET_AVAILABILITY_BYTES as u64);
    serde_json::to_writer(&mut digest, report)?;
    Ok(digest.finish().0)
}
