//! Local target identity covers the actual completed restore and both of its owners.
use super::RecoveredRelaySegmentRoom;
use crate::{Error, Result, assets::AssetBackupStream};
use sha2::{Digest, Sha256};

impl RecoveredRelaySegmentRoom {
    pub(crate) fn check_portable_input_roster(
        &self,
        selected: &crate::server::RelaySegmentRetainedBackupIdentity,
    ) -> Result<()> {
        self.check_custody()?;
        super::serving::check_portable_input_roster(
            self.journals.as_ref(),
            self.alternatives.as_ref(),
            self.uploads.as_ref(),
            selected,
        )
    }

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
        let digest = if let Some(alternatives) = &self.alternatives {
            let journals = self.journals.as_ref().ok_or(Error::NeedsRecovery)?;
            let uploads = self.uploads.as_ref().ok_or(Error::NeedsRecovery)?;
            Sha256::digest(serde_json::to_vec(&(
                "breditor/relay-segment-handover-target/6",
                common,
                &self.client_rasters,
                &self.restored_assets,
                uploads.selection(),
                journals.selection(),
                alternatives.selection(),
            ))?)
        } else if let Some(journals) = &self.journals {
            let uploads =
                self.uploads.as_ref().ok_or(Error::Contract("missing journal cohort uploads"))?;
            Sha256::digest(serde_json::to_vec(&(
                "breditor/relay-segment-handover-target/5",
                common,
                &self.client_rasters,
                &self.restored_assets,
                uploads.selection(),
                journals.selection(),
            ))?)
        } else if let Some(uploads) = &self.uploads {
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
        self.fresh_handover_rasters().map(|_| ())
    }

    pub(crate) fn fresh_handover_rasters(&self) -> Result<AssetBackupStream<'_>> {
        self.room.log.check_fresh_segment_restoration(&self.active)?;
        let rasters = self.assets.prepare_backup_stream()?;
        if rasters.identity != self.restored_assets {
            return Err(Error::Contract("relay segment handover target asset cut advanced"));
        }
        self.check_custody()?;
        Ok(rasters)
    }

    pub(crate) fn handover_backup(&self) -> &crate::RelaySegmentRoomBackupIdentity {
        &self.backup
    }

    pub(crate) fn handover_client_rasters(&self) -> &[String] {
        &self.client_rasters
    }

    pub(crate) fn requires_verified_handover(&self) -> bool {
        self.journals.is_some() || self.uploads.is_some() || !self.client_rasters.is_empty()
    }

    pub(crate) fn check_handover_client_rasters(&self) -> Result<()> {
        super::client_rasters::check_retained(&self.assets, &self.client_rasters)?;
        self.check_custody()
    }
}
