//! Local target identity covers the actual completed restore and both of its owners.
use super::RecoveredRelaySegmentRoom;
use crate::{Error, Result};
use sha2::{Digest, Sha256};

impl RecoveredRelaySegmentRoom {
    pub(crate) fn check_handover_owner(&self, principal: &str) -> Result<()> {
        self.room.recovery_inventory_owner(principal)
    }

    pub(crate) fn handover_binding(&self) -> Result<[u8; 32]> {
        self.check_custody()?;
        let owners = (
            self.directory.witness()?,
            self.room.log.segment_directory_witness()?,
            self.raster.witness(),
        );
        Ok(Sha256::digest(serde_json::to_vec(&(
            "breditor/relay-segment-handover-target/1",
            &self.backup,
            &self.active,
            owners,
        ))?)
        .into())
    }

    pub(crate) fn check_fresh_handover_target(&self) -> Result<()> {
        self.room.log.check_fresh_segment_restoration(&self.active)?;
        if self.assets.prepare_backup_stream()?.identity != self.backup.assets {
            return Err(Error::Contract("relay segment handover target asset cut advanced"));
        }
        self.check_custody()
    }

    pub(crate) fn handover_backup(&self) -> &crate::RelaySegmentRoomBackupIdentity {
        &self.backup
    }
}
