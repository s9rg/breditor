//! Select an exact movable source cut and activate it with fresh target verification.
use super::{ContinuedAssetServerHandle, ContinuedRasterActivation, activation::serve};
use crate::{
    Error, RecoveryRegistrationCredentials, Result,
    archive_digest::ArchiveDigest,
    credentials,
    server::{
        Authentication, ContinuedRasterRoomBackupFiles, ContinuedRasterRoomBackupIdentity,
        ContinuedRasterRoomInputReport, LogGenerationHandoverStatus,
        MAX_SERVER_ASSET_AVAILABILITY_BYTES, RecoveredContinuedRasterRoom, RoomDeploymentAuthority,
        RoomDeploymentSelection, ServerRecoveryAssetProvider, deployment_fence,
        generation_backup::durable::Interruption,
    },
};
use axum::Router;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// An independently retained decision to stop one live room at an exact portable cut.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContinuedRasterSeal {
    format_version: u32,
    salt: String,
    backup: ContinuedRasterRoomBackupIdentity,
    portable_inputs_sha256: [u8; 32],
}

impl ContinuedRasterSeal {
    /// Select the exact backup, portable client originals and resolved image dependencies.
    /// Persist independently before sealing the source. The source must use coordinated recovery.
    ///
    /// # Errors
    /// Refuses incomplete inputs, invalid selections and unavailable epoch capacity.
    pub fn select(report: &ContinuedRasterRoomInputReport) -> Result<Self> {
        let seal = Self {
            format_version: 1,
            salt: credentials::issue()?,
            backup: report.backup.clone(),
            portable_inputs_sha256: portable_input_digest(report)?,
        };
        seal.planned_selection()?;
        Ok(seal)
    }

    /// The native and raster capture identities bound by the seal.
    #[must_use]
    pub const fn backup(&self) -> &ContinuedRasterRoomBackupIdentity {
        &self.backup
    }

    /// The seal epoch contains the exact source decision.
    ///
    /// # Errors
    /// Refuses invalid decisions or insufficient epoch capacity for both seal and activation.
    pub fn planned_selection(&self) -> Result<RoomDeploymentSelection> {
        let sealed =
            deployment_fence::handover_selection(&self.backup.source_epoch, &self.nonce()?)?;
        deployment_fence::handover_selection(&sealed, &[0; 32])?;
        Ok(sealed)
    }

    /// Read whether the actual authority recorded this exact seal.
    ///
    /// # Errors
    /// Refuses unrelated or uncertain authority.
    pub fn status(
        &self,
        authority: &RoomDeploymentAuthority,
    ) -> Result<LogGenerationHandoverStatus> {
        deployment_fence::prepared_decision_status(
            authority,
            &self.backup.source_epoch,
            &self.planned_selection()?,
        )
    }

    pub(in crate::server) fn check_report(
        &self,
        report: &ContinuedRasterRoomInputReport,
    ) -> Result<()> {
        if report.backup != self.backup
            || portable_input_digest(report)? != self.portable_inputs_sha256
        {
            return Err(Error::Contract("continued raster sealed inputs differ"));
        }
        Ok(())
    }

    pub(in crate::server) fn nonce(&self) -> Result<[u8; 32]> {
        self.backup.check_selection()?;
        if self.format_version != 1
            || !self.backup.source_epoch.identity.requires_coordinated_recovery()
        {
            return Err(Error::Contract(
                "continued raster portable seal requires coordinated recovery",
            ));
        }
        credentials::hash(&self.salt)?;
        Ok(Sha256::digest(serde_json::to_vec(&("breditor/continued-raster-source-seal/1", self))?)
            .into())
    }
}

// A relocated target has its own completion pin and fresh empty suffix. Commit to
// actual portable inputs and immutable accepted history instead of those local coordinates.
fn portable_input_digest(report: &ContinuedRasterRoomInputReport) -> Result<[u8; 32]> {
    if !report.inputs_complete() {
        return Err(Error::Contract("continued raster portable inputs incomplete"));
    }
    let mut digest = ArchiveDigest::new(MAX_SERVER_ASSET_AVAILABILITY_BYTES as u64);
    let inputs = (
        "breditor/continued-raster-portable-inputs/1",
        &report.backup,
        &report.participants,
        &report.references.sources,
        &report.references.outcome,
        &report.client_journals,
        &report.alternate_branches,
        &report.client_uploads,
        &report.resolutions,
        &report.assets,
    );
    if report.rolled_raster_generation {
        serde_json::to_writer(
            &mut digest,
            &("breditor/continued-raster-portable-rollover/1", inputs, &report.staged_rasters),
        )?;
    } else {
        serde_json::to_writer(&mut digest, &inputs)?;
    }
    Ok(digest.finish().0)
}

/// Exact portable intent, protected original records and current image mapping guard.
pub struct ContinuedRasterSealing<'a> {
    /// Independently retained source decision.
    pub seal: &'a ContinuedRasterSeal,
    /// Original protected registrations.
    pub credentials: &'a RecoveryRegistrationCredentials,
    /// Current provider guard.
    pub provider: &'a dyn ServerRecoveryAssetProvider,
}

/// Cold authority and newly approved local target for an exact sealed cut.
pub struct SealedContinuedRasterActivation<'a> {
    /// Actual cold authority, opened at or beyond the independently retained seal.
    pub authority: &'a RoomDeploymentAuthority,
    /// The previously committed source decision.
    pub seal: &'a ContinuedRasterSeal,
    /// Fresh target approval with its original registrations and provider guard.
    pub target: ContinuedRasterActivation<'a>,
}

impl ContinuedAssetServerHandle {
    /// Fence the live source and verify all portable inputs before the source stops.
    /// Hold the actual backup and a complete unpublished preflight restore. Run off async workers.
    ///
    /// # Errors
    /// Refuses changed backup, source or client files, stale mappings, and invalid credentials.
    pub fn seal_recovered_room(
        &self,
        principal: &str,
        token: &str,
        backup: &ContinuedRasterRoomBackupFiles,
        preflight: &mut RecoveredContinuedRasterRoom,
        selected: &ContinuedRasterSealing<'_>,
    ) -> Result<RoomDeploymentSelection> {
        self.host.authentication.authenticate(principal, token)?;
        deployment_fence::seal_continued_raster(
            &self.host,
            principal,
            token,
            backup,
            preflight,
            selected,
            &Interruption::default(),
        )
    }
}

impl RecoveredContinuedRasterRoom {
    /// Activate a fresh approved local restore from the committed seal after source shutdown.
    /// Retain the approval independently before activation. Restart uses the same approval.
    ///
    /// # Errors
    /// Refuses an uncommitted or superseded seal, or changed portable inputs and target custody.
    pub fn activate_sealed_room(
        mut self,
        authentication: Authentication,
        principal: &str,
        token: &str,
        selection: &SealedContinuedRasterActivation<'_>,
    ) -> Result<(Router, ContinuedAssetServerHandle, RoomDeploymentSelection)> {
        authentication.authenticate(principal, token)?;
        let lease = deployment_fence::activate_sealed_continued_raster(
            &mut self,
            &authentication,
            principal,
            token,
            selection,
        )?;
        serve(self, authentication, &lease)
    }
}
