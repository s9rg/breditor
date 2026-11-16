//! Restore original upload archives as custody, with only explicitly selected participant rasters live.
use super::{
    RecoveredRelaySegmentRoom, RelaySegmentClientJournal, RelaySegmentClientUploadArchive,
    RelaySegmentRoomBackupFiles, client_uploads, restore::OriginalJournals,
};
use crate::{
    Error, Result, RoomRecoveryPolicy,
    assets::{MAX_ASSETS, asset_key},
};
use std::{collections::BTreeSet, path::Path};

/// Original client inputs and the extra queue payloads to install as live rasters.
#[derive(Clone, Copy, Default)]
pub struct RelaySegmentQueuedRasterRestore<'a> {
    /// Independently selected standalone queue archives in canonical writer order.
    pub archives: &'a [RelaySegmentClientUploadArchive],
    /// Selected original client journals, which can also embed queues and dependency rasters.
    pub journals: &'a [RelaySegmentClientJournal],
    /// Original alternate journals kept for independent recovery.
    pub alternatives: &'a [RelaySegmentClientJournal],
    /// Additional content IDs to stage from the selected queues, sorted and unique.
    pub queued_rasters: &'a [String],
}

impl RelaySegmentRoomBackupFiles {
    /// Restore a room and retain complete original client upload queues for ordinary later delivery.
    ///
    /// All existing server assets and selected participant dependency rasters are staged in the
    /// target. Upload-only rasters remain in their original queues, with their exact status,
    /// epochs and receipts. Required assets and registrations still need normal handover
    /// verification. Retrying an upload after takeover remains subject to live capacity.
    ///
    /// # Errors
    /// Refuses invalid rosters, mismatched or undecodable client payloads, excessive live raster
    /// dependencies, changed storage and occupied destinations.
    pub fn restore_retaining_client_uploads(
        &self,
        path: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
        archives: &[RelaySegmentClientUploadArchive],
        journals: &[RelaySegmentClientJournal],
        alternatives: &[RelaySegmentClientJournal],
    ) -> Result<RecoveredRelaySegmentRoom> {
        self.restore_selecting_queued_rasters(
            path,
            active_generation,
            policy,
            RelaySegmentQueuedRasterRestore {
                archives,
                journals,
                alternatives,
                queued_rasters: &[],
            },
        )
    }

    /// Restore a fresh target with the original queues and a selected subset of their rasters.
    ///
    /// In addition to original server assets and participant dependencies, install only the
    /// supplied queue payloads. A missing live raster reported during normal handover
    /// verification can be selected for another restore. Queue state and upload receipts
    /// remain in the original archives. Handover still requires live provider verification.
    ///
    /// # Errors
    /// Refuses malformed, duplicate, unsorted or missing content IDs, invalid queue data,
    /// over-budget live raster unions, occupied destinations and uncertain storage.
    pub fn restore_selecting_queued_rasters(
        &self,
        path: &Path,
        active_generation: &str,
        policy: RoomRecoveryPolicy,
        inputs: RelaySegmentQueuedRasterRestore<'_>,
    ) -> Result<RecoveredRelaySegmentRoom> {
        let RelaySegmentQueuedRasterRestore { archives, journals, alternatives, queued_rasters } =
            inputs;
        check_queued_rasters(queued_rasters)?;
        let originals = OriginalJournals { selected: journals, alternatives };
        let sources = originals.uploads(archives)?;
        let required: BTreeSet<_> = journals
            .iter()
            .flat_map(RelaySegmentClientJournal::participant_raster_ids)
            .chain(queued_rasters.iter().map(String::as_str))
            .collect();
        let from_queues = client_uploads::select(&sources, Some(&required))?;
        for id in queued_rasters {
            if from_queues.binary_search_by(|raster| raster.info.asset.cmp(id)).is_err() {
                return Err(Error::Contract("selected raster missing from client upload archives"));
            }
        }
        let rasters = originals.rasters(from_queues)?;
        let originals = (!journals.is_empty()).then_some(originals);
        let uploads = (originals.is_some() || !sources.is_empty()).then_some(sources.as_slice());
        self.restore_selected(path, active_generation, policy, &rasters, uploads, originals)
    }
}

fn check_queued_rasters(ids: &[String]) -> Result<()> {
    if ids.len() > MAX_ASSETS {
        return Err(Error::Contract("selected queued raster count budget"));
    }
    if !ids.is_sorted_by(|left, right| left < right) {
        return Err(Error::Contract("selected queued rasters must be unique and sorted"));
    }
    for id in ids {
        asset_key(id)?;
    }
    Ok(())
}
