//! Authenticate input verification for the complete unpublished native and raster cut.
use crate::{
    MissingRecoveryRegistration, RecoveryRegistrationCredentials,
    RelaySegmentClientJournalCoverage, RelaySegmentClientUploadPin, RelaySegmentParticipantBranch,
    Result, RoomParticipantInventoryMetadata, ServerAssetReferenceOutcome,
    ServerRelaySegmentAssetReferences,
    archive_digest::ArchiveDigest,
    assets::AssetInfo,
    server::{
        Authentication, ContinuedRasterRoomBackupIdentity, MAX_SERVER_ASSET_AVAILABILITY_BYTES,
        RecoveredContinuedRasterRoom, RecoveredContinuedRasterRoomIdentity,
        ServerAssetAvailabilityMissing, ServerAssetResolution, ServerRecoveryAssetProvider,
        backup::{check_server_asset_provider, resolve_server_assets_from},
        segment_handover::{
            check_participant_asset_bindings, missing_upload_writers, required_handover_assets,
        },
    },
};
use serde::Serialize;

/// Detached original inputs and live byte observations for an unserved continued raster room.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuedRasterRoomInputReport {
    /// Report encoding family.
    pub format: &'static str,
    /// Exact report revision.
    pub format_version: u32,
    /// Independently selected storage capture.
    pub backup: ContinuedRasterRoomBackupIdentity,
    /// Local restored owner and client file selection.
    pub target: RecoveredContinuedRasterRoomIdentity,
    /// Current native document writers and independent review registrations at the captured cut.
    pub participants: RoomParticipantInventoryMetadata,
    /// Original native record positions and accepted document, review, and historical image dependencies.
    pub references: ServerRelaySegmentAssetReferences,
    /// Every remaining host-protected original resume record.
    pub missing_registrations: Vec<MissingRecoveryRegistration>,
    /// Exact selected journal replay and each missing document/review stream.
    pub client_journals: RelaySegmentClientJournalCoverage,
    /// Native prefix comparison of original alternate branches. These are retained as alternatives.
    pub alternate_branches: Vec<RelaySegmentParticipantBranch>,
    /// Original upload archives and receipts, including embedded participant queues.
    pub client_uploads: Vec<RelaySegmentClientUploadPin>,
    /// Every registered writer without an upload archive, including zero-work and revoked writers.
    pub missing_upload_writers: Vec<String>,
    /// Exact missing raster IDs staged from client originals during restoration.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub staged_rasters: Vec<String>,
    /// Missing live provider mappings or complete bytes through either captured raster generation.
    pub missing_assets: Vec<ServerAssetAvailabilityMissing>,
    /// Verified generation-exact provider mappings.
    pub resolutions: Vec<ServerAssetResolution>,
    /// Metadata of actual read and admitted content across both generations.
    pub assets: Vec<AssetInfo>,
}

impl ContinuedRasterRoomInputReport {
    /// Whether the inspected cut has all selected inputs and current decoded raster dependencies.
    /// Takeover needs fresh checks and a separately authorized deployment epoch.
    #[must_use]
    pub fn inputs_complete(&self) -> bool {
        matches!(self.references.outcome, ServerAssetReferenceOutcome::Ready { .. })
            && self.missing_registrations.is_empty()
            && self.client_journals.missing_document_writers.is_empty()
            && self.client_journals.missing_review_actors.is_empty()
            && self.missing_upload_writers.is_empty()
            && self.missing_assets.is_empty()
    }
}

impl RecoveredContinuedRasterRoom {
    /// Authenticate the original room owner and reconcile the actual unserved restored cut.
    /// Inspect missing registrations, native client streams, upload archives, and image dependencies.
    /// This operation delivers no client work. Run off async I/O workers; obtain the provider
    /// mapping guard in advance and keep its callbacks local.
    ///
    /// # Errors
    /// Refuses invalid credentials, changed storage, incompatible histories, invalid current
    /// provider inputs and complete reports that exceed the existing evidence budget.
    pub fn verify_recovery_inputs(
        &mut self,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        credentials: &RecoveryRegistrationCredentials,
        provider: &dyn ServerRecoveryAssetProvider,
    ) -> Result<ContinuedRasterRoomInputReport> {
        authentication.authenticate(principal, token)?;
        let cut = self.recovery_input_cut(principal, credentials)?;
        let client_uploads = self.client_upload_pins()?;
        let missing_upload_writers = missing_upload_writers(&client_uploads, &cut.participants)?;
        let required = required_handover_assets(&cut.references.outcome, Some(&cut.journals))?;
        let (resolutions, assets, missing_assets) = if let Some(required) = required {
            let checked = resolve_server_assets_from(|id| self.asset(id), &required, provider)?;
            check_participant_asset_bindings(Some(&cut.journals), &checked.resolutions)?;
            (checked.resolutions, checked.assets, checked.missing)
        } else {
            (Vec::new(), Vec::new(), Vec::new())
        };
        check_server_asset_provider(provider)?;
        self.check_exact_restored_cut()?;
        let report = ContinuedRasterRoomInputReport {
            format: "breditor/continued-raster-room-inputs",
            format_version: 1,
            backup: cut.backup,
            target: self.identity().clone(),
            participants: cut.participants,
            references: cut.references,
            missing_registrations: cut.missing_registrations,
            client_journals: cut.journals,
            alternate_branches: cut.alternate_branches,
            client_uploads,
            missing_upload_writers,
            staged_rasters: self.staged_rasters().to_vec(),
            missing_assets,
            resolutions,
            assets,
        };
        let mut digest = ArchiveDigest::new(MAX_SERVER_ASSET_AVAILABILITY_BYTES as u64);
        serde_json::to_writer(&mut digest, &report)?;
        Ok(report)
    }
}
