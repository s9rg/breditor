//! Export published discussion provenance from a current authenticated room.
use crate::{
    Error, RelaySegmentClientJournalPin, Result,
    server::{RoomDeploymentSelection, ServerBackupHandle, deployment_fence},
};
use std::{collections::BTreeSet, path::Path};

impl ServerBackupHandle {
    /// Export exact originals for the requested whole-file digests, including an alternate
    /// that later became a selected participant archive. Supply the digests from the
    /// portable backup and the current serving epoch. Returned pins are sorted by digest
    /// and correspond to `{index}.participant` files in the absent destination directory.
    /// An empty request leaves the destination absent. Run off async I/O workers.
    ///
    /// # Errors
    /// Refuses invalid owner authentication, a stale epoch, unreferenced or missing sources,
    /// changed file custody and occupied destinations for a nonempty export.
    pub fn export_relay_segment_recovered_discussion_sources(
        &self,
        principal: &str,
        token: &str,
        expected: &RoomDeploymentSelection,
        requested: &[[u8; 32]],
        destination: &Path,
    ) -> Result<Vec<RelaySegmentClientJournalPin>> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        host.deployment.fenced(|lease| {
            deployment_fence::transaction(Some(lease), || {
                if &lease.selection() != expected {
                    return Err(Error::Lease);
                }
                let published = {
                    let room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                    room.recovery_inventory_owner(principal)?;
                    room.recovered_discussion_source_digests()
                };
                let requested: BTreeSet<_> = requested.iter().copied().collect();
                if !requested.is_subset(&published) {
                    return Err(Error::Contract("recovered discussion source is not published"));
                }
                if requested.is_empty() {
                    return Ok(Vec::new());
                }
                let held = host.relay_segment_custody.as_ref().ok_or(Error::NeedsRecovery)?;
                held.export_recovered_discussion_sources(&requested, destination)
            })
        })
    }
}
