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
        let common = (&self.backup, &self.active, owners);
        let digest = if let Some(uploads) = &self.uploads {
            Sha256::digest(serde_json::to_vec(&(
                "breditor/relay-segment-handover-target/3",
                common,
                &self.client_rasters,
                &self.restored_assets,
                uploads.selection(),
            ))?)
        } else if self.client_rasters.is_empty() {
            let (backup, active, owners) = common;
            Sha256::digest(serde_json::to_vec(&(
                "breditor/relay-segment-handover-target/1",
                backup,
                active,
                owners,
            ))?)
        } else {
            Sha256::digest(serde_json::to_vec(&(
                "breditor/relay-segment-handover-target/2",
                common,
                &self.client_rasters,
                &self.restored_assets,
            ))?)
        };
        Ok(digest.into())
    }

    pub(crate) fn check_fresh_handover_target(&self) -> Result<()> {
        self.room.log.check_fresh_segment_restoration(&self.active)?;
        if self.assets.prepare_backup_stream()?.identity != self.restored_assets {
            return Err(Error::Contract("relay segment handover target asset cut advanced"));
        }
        self.check_custody()
    }

    pub(crate) fn handover_backup(&self) -> &crate::RelaySegmentRoomBackupIdentity {
        &self.backup
    }

    pub(crate) fn handover_client_rasters(&self) -> &[String] {
        &self.client_rasters
    }

    pub(crate) fn requires_verified_handover(&self) -> bool {
        self.uploads.is_some() || !self.client_rasters.is_empty()
    }

    pub(crate) fn check_handover_client_rasters(&self) -> Result<()> {
        super::client_rasters::check_retained(&self.assets, &self.client_rasters)?;
        self.check_custody()
    }
}
