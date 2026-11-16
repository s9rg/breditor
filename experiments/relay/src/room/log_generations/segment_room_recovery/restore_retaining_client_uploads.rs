//! Restore original upload archives as custody, with only explicitly selected participant rasters live.
use super::{
    RecoveredRelaySegmentRoom, RelaySegmentClientJournal, RelaySegmentClientUploadArchive,
    RelaySegmentRoomBackupFiles, client_uploads, restore::OriginalJournals,
};
use crate::{Result, RoomRecoveryPolicy};
use std::path::Path;

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
        let originals = OriginalJournals { selected: journals, alternatives };
        let sources = originals.uploads(archives)?;
        let required =
            journals.iter().flat_map(RelaySegmentClientJournal::participant_raster_ids).collect();
        let rasters = originals.rasters(client_uploads::select(&sources, Some(&required))?)?;
        let originals = (!journals.is_empty()).then_some(originals);
        let uploads = (originals.is_some() || !sources.is_empty()).then_some(sources.as_slice());
        self.restore_selected(path, active_generation, policy, &rasters, uploads, originals)
    }
}
