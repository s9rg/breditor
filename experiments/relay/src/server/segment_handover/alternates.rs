//! Export retained alternate participant files from the currently authenticated serving owner.
use crate::{
    Error, RelaySegmentClientJournalPin, Result,
    server::{RoomDeploymentSelection, ServerBackupHandle, deployment_fence},
};
use std::path::Path;

impl ServerBackupHandle {
    /// Export the exact alternate participant files from the current serving epoch.
    /// Returns pins in canonical owner order. The corresponding files are named
    /// `{index}.participant`, starting at zero. Retain these pins independently.
    /// An empty result leaves the path absent. Run this operation off async workers.
    ///
    /// # Errors
    /// Refuses invalid owner authentication, stale or superseded epochs, uncertain
    /// custody and occupied destinations for a nonempty export. An incomplete export
    /// can remain on failure. Preserve it and retry at a new absent path.
    pub fn export_relay_segment_participant_alternates(
        &self,
        principal: &str,
        token: &str,
        expected: &RoomDeploymentSelection,
        destination: &Path,
    ) -> Result<Vec<RelaySegmentClientJournalPin>> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        host.deployment.fenced(|lease| {
            deployment_fence::transaction(Some(lease), || {
                if &lease.selection() != expected {
                    return Err(Error::Lease);
                }
                let room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                room.recovery_inventory_owner(principal)?;
                let Some(custody) = &host.relay_segment_custody else {
                    return Ok(Vec::new());
                };
                custody.export_alternates(destination)
            })
        })
    }
}
