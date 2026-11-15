//! Check protected streams and provider-backed server assets at the completed restore cut.
use crate::{
    Error, MAX_SERVER_ASSET_REFERENCE_PAIRS, MissingRecoveryRegistration,
    RecoveredRelaySegmentRoom, RecoveryRegistrationCredentials, RelaySegmentClientJournalCoverage,
    RelaySegmentClientUploadPin, RelaySegmentRoomBackupIdentity, Result,
    RoomParticipantInventoryMetadata, ServerAssetReferenceOutcome,
    ServerRelaySegmentAssetReferences,
    archive_digest::ArchiveDigest,
    assets::AssetInfo,
    server::{
        Authentication, MAX_SERVER_ASSET_AVAILABILITY_BYTES, ServerAssetAvailabilityMissing,
        ServerAssetResolution, ServerRecoveryAssetProvider,
        backup::{check_server_asset_provider, resolve_server_assets},
    },
};
use breditor_collab_feasibility::rich_replica::VersionAssetReference;
use serde::Serialize;
use std::{
    borrow::Cow,
    collections::BTreeSet,
    sync::{Arc, Weak},
};

/// Exact restored native inventory, retained dependencies and available provider mappings.
/// This report contains no resume credentials and cannot authorize a handover by itself.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySegmentHandoverInputReport {
    /// Independent report family.
    pub format: &'static str,
    /// Exact report revision.
    pub format_version: u32,
    /// Approved accepted source, including the ordered history and whole raster store.
    pub backup: RelaySegmentRoomBackupIdentity,
    /// Every current native registration and author prefix at that cut.
    pub participants: RoomParticipantInventoryMetadata,
    /// Native causal/effect and retained packet dependencies, with absolute packet positions.
    pub references: ServerRelaySegmentAssetReferences,
    /// Missing original resume records, including revoked or read-only registrations.
    pub missing_registrations: Vec<MissingRecoveryRegistration>,
    /// Missing current provider mappings or actual stored bytes for accepted and offline bindings.
    pub missing_assets: Vec<ServerAssetAvailabilityMissing>,
    /// Current checked mapping for each resolved native asset and binding generation.
    pub resolutions: Vec<ServerAssetResolution>,
    /// Metadata of the actual native raster bytes read during verification.
    pub assets: Vec<AssetInfo>,
    /// Selected client payloads already synced into the new store. These are not upload receipts.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub client_rasters: Vec<String>,
    /// Complete original archive pins if a writer upload cohort was selected.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_upload_archives: Option<Vec<RelaySegmentClientUploadPin>>,
    /// Every original registered writer without an enrolled upload archive.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub missing_upload_writers: Vec<String>,
    /// Native journal enrollment and common-prefix evidence, for a selected journal cohort.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_journal_coverage: Option<RelaySegmentClientJournalCoverage>,
}

impl RelaySegmentHandoverInputReport {
    fn required_assets(&self) -> Result<Option<Cow<'_, [VersionAssetReference]>>> {
        let ServerAssetReferenceOutcome::Ready { references } = &self.references.outcome else {
            return Ok(None);
        };
        let Some(journals) = &self.client_journal_coverage else {
            return Ok(Some(Cow::Borrowed(references)));
        };
        let merged: BTreeSet<_> = references.iter().chain(&journals.asset_references).collect();
        if merged.len() > MAX_SERVER_ASSET_REFERENCE_PAIRS {
            return Err(Error::Contract("relay segment handover raster binding budget"));
        }
        Ok(Some(Cow::Owned(merged.into_iter().cloned().collect())))
    }

    fn check_participant_bindings(&self, resolutions: &[ServerAssetResolution]) -> Result<()> {
        let Some(journals) = &self.client_journal_coverage else {
            return Ok(());
        };
        for expected in &journals.participant_raster_bindings {
            if let Ok(i) =
                resolutions.binary_search_by(|row| row.reference.cmp(&expected.reference))
                && resolutions[i].content_asset != expected.content_asset
            {
                return Err(Error::Contract(
                    "participant archive and live raster mapping disagree",
                ));
            }
        }
        Ok(())
    }
}

/// Coverage of protected registrations and accepted server asset inputs.
pub enum RelaySegmentHandoverInputCoverage {
    /// Complete protected streams, retained server dependencies and current mapped rasters.
    Verified(VerifiedRelaySegmentHandoverInputs),
    /// Preserve the selected state and resolve its missing inputs before verified takeover.
    Pending(Box<RelaySegmentHandoverInputReport>),
}

/// Same-target verification of the original protected streams and current server asset provider.
/// Keep the original provider guard alive through commit. This does not deliver offline work.
pub struct VerifiedRelaySegmentHandoverInputs {
    target: [u8; 32],
    principal: String,
    provider: Weak<dyn ServerRecoveryAssetProvider>,
    report: Box<RelaySegmentHandoverInputReport>,
    digest: [u8; 32],
}

impl VerifiedRelaySegmentHandoverInputs {
    /// Inspect the complete checked server inputs.
    #[must_use]
    pub fn report(&self) -> &RelaySegmentHandoverInputReport {
        &self.report
    }

    pub(super) fn digest(&self) -> [u8; 32] {
        self.digest
    }

    pub(super) fn check_target(&self, target: &RecoveredRelaySegmentRoom) -> Result<()> {
        if self.target != target.handover_binding()?
            || &self.report.backup != target.handover_backup()
        {
            return Err(Error::Contract("relay segment handover input target differs"));
        }
        Ok(())
    }

    pub(in crate::server) fn recheck(
        &self,
        principal: &str,
        target: &RecoveredRelaySegmentRoom,
    ) -> Result<Arc<dyn ServerRecoveryAssetProvider>> {
        if self.principal != principal {
            return Err(Error::Permission);
        }
        self.check_target(target)?;
        let provider = self
            .provider
            .upgrade()
            .ok_or(Error::Contract("relay segment handover provider released"))?;
        let references = self.report.required_assets()?.ok_or(Error::NeedsRecovery)?;
        let current = resolve_server_assets(target.components().1, &references, provider.as_ref())?;
        self.report.check_participant_bindings(&current.resolutions)?;
        if !current.missing.is_empty()
            || current.resolutions != self.report.resolutions
            || current.assets != self.report.assets
        {
            return Err(Error::Contract("relay segment handover provider inputs changed"));
        }
        // No external callback follows this actual native and raster cut comparison.
        self.check_target(target)?;
        target.check_fresh_handover_target()?;
        Ok(provider)
    }
}

impl RecoveredRelaySegmentRoom {
    /// Verify protected registrations and all accepted server packet/asset inputs on this actual
    /// untouched restore. Returns explicit Pending inputs. Run off async I/O workers. The
    /// provider callback must read an already acquired mapping guard and perform no remote I/O.
    ///
    /// # Errors
    /// Invalid current owner authentication, wrong supplied credentials, uncertain storage,
    /// changed provider authority and over-budget complete reports refuse.
    pub fn verify_handover_inputs(
        &mut self,
        authentication: &Authentication,
        principal: &str,
        token: &str,
        credentials: &RecoveryRegistrationCredentials,
        provider: &Arc<dyn ServerRecoveryAssetProvider>,
    ) -> Result<RelaySegmentHandoverInputCoverage> {
        authentication.authenticate(principal, token)?;
        self.check_handover_owner(principal)?;
        self.check_fresh_handover_target()?;
        let target = self.handover_binding()?;
        let backup = self.handover_backup().clone();
        let client_rasters = self.handover_client_rasters().to_vec();
        let client_upload_archives = self.client_upload_pins()?;
        let (room, _) = self.components();
        let participants = room
            .capture_participant_inventory_at(principal, backup.native.predecessor.source.clone())?
            .metadata();
        let missing_registrations =
            room.missing_recovery_registrations(&participants, credentials)?;
        let missing_upload_writers = match &client_upload_archives {
            Some(pins) => super::upload_coverage::missing(pins, &participants)?,
            None => Vec::new(),
        };
        let client_journal_coverage = self.handover_client_journals(&participants)?;
        let (room, assets) = self.components_mut();
        let references = room.relay_segment_retained_asset_references(principal)?;
        if references.room != backup.native.predecessor.source || references.base != backup.native {
            return Err(Error::Contract("relay segment handover input cut differs"));
        }
        let mut report = Box::new(RelaySegmentHandoverInputReport {
            format: "breditor/relay-segment-handover-inputs",
            format_version: if client_journal_coverage.is_some() { 3 } else { 1 },
            backup,
            participants,
            references,
            missing_registrations,
            missing_assets: Vec::new(),
            resolutions: Vec::new(),
            assets: Vec::new(),
            client_rasters,
            client_upload_archives,
            missing_upload_writers,
            client_journal_coverage,
        });
        let packet_pending = if let Some(references) = report.required_assets()? {
            let resolved = resolve_server_assets(assets, &references, provider.as_ref())?;
            report.check_participant_bindings(&resolved.resolutions)?;
            report.missing_assets = resolved.missing;
            report.resolutions = resolved.resolutions;
            report.assets = resolved.assets;
            false
        } else {
            true
        };
        check_server_asset_provider(provider.as_ref())?;
        if self.handover_binding()? != target {
            return Err(Error::Contract("relay segment handover input custody changed"));
        }
        self.check_fresh_handover_target()?;
        let mut digest = ArchiveDigest::new(MAX_SERVER_ASSET_AVAILABILITY_BYTES as u64);
        serde_json::to_writer(&mut digest, &report)?;
        if packet_pending
            || !report.missing_registrations.is_empty()
            || !report.missing_assets.is_empty()
            || !report.missing_upload_writers.is_empty()
            || report.client_journal_coverage.as_ref().is_some_and(|coverage| {
                !coverage.missing_document_writers.is_empty()
                    || !coverage.missing_review_actors.is_empty()
            })
        {
            return Ok(RelaySegmentHandoverInputCoverage::Pending(report));
        }
        Ok(RelaySegmentHandoverInputCoverage::Verified(VerifiedRelaySegmentHandoverInputs {
            target,
            principal: principal.to_owned(),
            provider: Arc::downgrade(provider),
            report,
            digest: digest.finish().0,
        }))
    }
}
