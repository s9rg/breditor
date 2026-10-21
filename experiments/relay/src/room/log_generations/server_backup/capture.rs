//! Both actual mutable owners remain borrowed for the entire serialized joined source capture.
use super::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    format::{self, Header, Section},
};
use crate::{Error, Result, Room, archive_digest::ArchiveDigest, assets::AssetStore};
impl ServerLogGenerationRoomBackup {
    /// Capture complete native history and every retained raster, including unreferenced files.
    /// Requires a current host-authenticated owner and serialized service access to both owners.
    /// Does not flush clients, fetch providers, upload, prune, change roles or append native events.
    /// # Errors
    /// Non-owner calls, original storage, component-binding mismatch, uncertain files or bounds
    /// refuse. Original storage/archive families retain their meanings and ceilings.
    pub fn capture(room: &mut Room, assets: &mut AssetStore, principal: &str) -> Result<Self> {
        room.recovery_inventory_owner(principal)?;
        if room.asset_binding() != assets.binding() {
            return Err(Error::Contract("joined generation asset binding"));
        }
        let native = room.export_log_generation_backup(principal)?;
        let rasters = assets.export_backup()?;
        native.check_live(room, principal)?;
        assets.check_exported_backup(&rasters)?;
        let native_identity = native.info().identity;
        let asset_identity = rasters.info().identity;
        let log_bytes = native.info().bytes;
        let header = Header {
            format: "breditor/server-log-generation-room-backup".into(),
            format_version: 1,
            native: native_identity.clone(),
            assets: asset_identity.clone(),
            log: Section { offset: 0, bytes: log_bytes, sha256: native_identity.archive_sha256 },
            rasters: Section {
                offset: log_bytes,
                bytes: rasters.encoded_len()?,
                sha256: asset_identity.archive_sha256,
            },
        };
        let mut value = Self {
            header,
            native,
            assets: rasters,
            identity: ServerLogGenerationRoomBackupIdentity {
                native: native_identity,
                assets: asset_identity,
                archive_sha256: [0; 32],
            },
        };
        let mut hash = ArchiveDigest::new(format::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES);
        value.write_to(&mut hash)?;
        let (sha256, bytes) = hash.finish();
        if bytes != value.encoded_len()? {
            return Err(Error::Contract("joined generation written length"));
        }
        value.identity.archive_sha256 = sha256;
        Ok(value)
    }
}
