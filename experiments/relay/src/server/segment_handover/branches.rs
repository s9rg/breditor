//! Compare actual original participant branches under the current predecessor serving epoch.
use crate::{
    Error, RelaySegmentClientJournal, RelaySegmentParticipantBranch,
    RelaySegmentRoomBackupIdentity, Result,
    server::{RoomDeploymentSelection, ServerBackupHandle, deployment_fence},
};
use serde::Serialize;
use std::io::sink;

/// Detached comparison at one complete authenticated current relay cut.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelaySegmentParticipantBranchInspection {
    /// Exact current native and raster cut.
    pub backup: RelaySegmentRoomBackupIdentity,
    /// Exact serving epoch held during both replays.
    pub epoch: RoomDeploymentSelection,
    /// The first independently selected original.
    pub current: RelaySegmentParticipantBranch,
    /// The second independently selected original.
    pub incoming: RelaySegmentParticipantBranch,
}

impl ServerBackupHandle {
    /// Compare original author streams for two versions of the same SDK participant.
    /// Shared prefixes permit catch-up if later verification succeeds. A conflicting own
    /// writer or actor is reported separately; foreign forks and bad registrations refuse.
    /// Run off async I/O workers. Use the ordinary verified handover path for selection,
    /// saved receipt admission, provider verification and an epoch transition.
    ///
    /// # Errors
    /// Refuses invalid current authentication, stale epoch or backup, wrong participant binding,
    /// changed originals and failure to replay the native document and review lanes.
    pub fn inspect_relay_segment_participant_branches(
        &self,
        principal: &str,
        token: &str,
        expected: &RelaySegmentRoomBackupIdentity,
        epoch: &RoomDeploymentSelection,
        current: &RelaySegmentClientJournal,
        incoming: &RelaySegmentClientJournal,
    ) -> Result<RelaySegmentParticipantBranchInspection> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        host.deployment.fenced(|lease| {
            deployment_fence::transaction(Some(lease), || {
                if &lease.selection() != epoch {
                    return Err(Error::Lease);
                }
                if let Some(custody) = &host.relay_segment_custody {
                    custody.check()?;
                }
                let mut room = host.room.lock().map_err(|_| Error::NeedsRecovery)?;
                let assets = host.assets.as_ref().ok_or(Error::NeedsRecovery)?;
                let assets = assets.lock().map_err(|_| Error::NeedsRecovery)?;
                let (backup, rasters) = room.write_relay_segment_room_backup_with_custody(
                    principal,
                    &assets,
                    &mut sink(),
                    &mut sink(),
                    &mut sink(),
                )?;
                if &backup != expected {
                    return Err(Error::Contract("relay participant branch source cut changed"));
                }
                let participants = room
                    .capture_participant_inventory_at(
                        principal,
                        backup.native.predecessor.source.clone(),
                    )?
                    .metadata();
                let [current, incoming] =
                    room.inspect_relay_participant_branches(&participants, current, incoming)?;
                rasters.check()?;
                room.recovery_inventory_owner(principal)?;
                if let Some(custody) = &host.relay_segment_custody {
                    custody.check()?;
                }
                Ok(RelaySegmentParticipantBranchInspection {
                    backup,
                    epoch: epoch.clone(),
                    current,
                    incoming,
                })
            })
        })
    }
}
