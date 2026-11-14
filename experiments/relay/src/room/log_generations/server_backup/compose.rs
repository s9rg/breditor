//! Canonical composition from owned exact native and raster archives.
use super::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    format::{self, Header, Section},
};
use crate::{
    Error, Result, ServerLogGenerationBackup, ServerLogGenerationBackupInfo,
    archive_digest::ArchiveDigest,
    assets::{AssetBackupIdentity, AssetStoreBackup},
};

impl Header {
    pub(super) fn new(
        native: &ServerLogGenerationBackupInfo,
        assets: &AssetBackupIdentity,
        raster_bytes: u64,
    ) -> Result<Self> {
        if native.identity.source.asset_binding != assets.binding {
            return Err(Error::Contract("joined generation asset binding"));
        }
        let log_bytes = native.bytes;
        Ok(Self {
            format: "breditor/server-log-generation-room-backup".into(),
            format_version: 1,
            native: native.identity.clone(),
            assets: assets.clone(),
            log: Section { offset: 0, bytes: log_bytes, sha256: native.identity.archive_sha256 },
            rasters: Section {
                offset: log_bytes,
                bytes: raster_bytes,
                sha256: assets.archive_sha256,
            },
        })
    }
}

impl ServerLogGenerationRoomBackup {
    pub(in crate::room) fn from_components(
        native: ServerLogGenerationBackup,
        rasters: AssetStoreBackup,
    ) -> Result<Self> {
        let native_info = native.info();
        let asset_identity = rasters.info().identity;
        let header = Header::new(&native_info, &asset_identity, rasters.encoded_len()?)?;
        let mut value = Self {
            header,
            native,
            assets: rasters,
            identity: ServerLogGenerationRoomBackupIdentity {
                native: native_info.identity,
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
