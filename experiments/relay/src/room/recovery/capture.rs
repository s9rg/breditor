//! Both mutable owners remain borrowed for the entire synchronous server capture.
use super::{
    ServerRoomBackup, ServerRoomBackupIdentity,
    format::{self, Header, Section},
};
use crate::{Error, Result, Room, assets::AssetStore};
impl ServerRoomBackup {
    /// Capture one serialized live server log/raster cut without flushing clients or uploading.
    /// The host must quiesce service calls and exclusively own both original native stores.
    /// # Errors
    /// Rejects mismatched rooms, uncertain/changed storage, native image failures and archive bounds.
    pub fn capture(room: &mut Room, assets: &mut AssetStore) -> Result<Self> {
        if room.asset_binding() != assets.binding() {
            return Err(Error::Contract("server backup asset binding"));
        }
        let room_identity = room.backup_identity()?;
        let log = room.export_backup()?;
        let raster = assets.export_backup()?;
        if room.backup_identity()? != room_identity {
            return Err(Error::Contract("server backup live cut changed"));
        }
        let log_bytes = log.to_bytes();
        let raster_bytes = raster.to_bytes()?;
        let asset_identity = raster.info().identity;
        let header = Header {
            format: "breditor/server-room-backup".into(),
            format_version: 1,
            room: room_identity.clone(),
            assets: asset_identity.clone(),
            log: Section {
                bytes: log_bytes.len() as u64,
                offset: 0,
                sha256: format::sha(&log_bytes),
            },
            rasters: Section {
                bytes: raster_bytes.len() as u64,
                offset: log_bytes.len() as u64,
                sha256: format::sha(&raster_bytes),
            },
        };
        let encoded = format::frame(&serde_json::to_vec(&header)?, &log_bytes, &raster_bytes)?;
        Ok(Self {
            header,
            room: log,
            assets: raster,
            identity: ServerRoomBackupIdentity {
                room: room_identity,
                assets: asset_identity,
                archive_sha256: format::sha(&encoded),
            },
        })
    }
}
