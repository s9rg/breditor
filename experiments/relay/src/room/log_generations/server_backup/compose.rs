//! Canonical composition from owned exact native and raster archives.
use super::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    format::{self, Header, Section},
};
use crate::{
    Error, Result, ServerLogGenerationBackup, archive_digest::ArchiveDigest,
    assets::AssetStoreBackup,
};

impl ServerLogGenerationRoomBackup {
    pub(in crate::room) fn from_components(
        native: ServerLogGenerationBackup,
        rasters: AssetStoreBackup,
    ) -> Result<Self> {
        let native_info = native.info();
        let native_identity = native_info.identity;
        let asset_identity = rasters.info().identity;
        if native_identity.source.asset_binding != asset_identity.binding {
            return Err(Error::Contract("joined generation asset binding"));
        }
        let log_bytes = native_info.bytes;
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
