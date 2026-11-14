//! Stream the canonical joined envelope through both held source owners.
use super::{
    ServerLogGenerationRoomBackup, ServerLogGenerationRoomBackupIdentity,
    ServerLogGenerationRoomBackupInfo,
    format::{self, Header, MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES},
};
use crate::{
    Error, Result, Room,
    archive_digest::ArchiveDigest,
    assets::{AssetBackupStream, AssetStore},
    room::log_generations::backup::BackupOutput,
};
use std::{cell::Cell, io::Write};

impl ServerLogGenerationRoomBackup {
    /// Stream a complete canonical native and raster archive through the current owners.
    /// Copying holds one decoded log record or raster at a time, plus bounded section metadata.
    /// The host authenticates the owner first and syncs or publishes its destination on success.
    ///
    /// # Errors
    /// Refuses incomplete, changed, unauthorized or differently bound sources and propagates
    /// output failures. Discard any partial destination on error.
    pub fn capture_to(
        room: &mut Room,
        assets: &AssetStore,
        principal: &str,
        writer: &mut impl Write,
    ) -> Result<ServerLogGenerationRoomBackupInfo> {
        room.recovery_inventory_owner(principal)?;
        if room.asset_binding() != assets.binding() {
            return Err(Error::Contract("joined generation asset binding"));
        }
        let rasters: AssetBackupStream<'_> = assets.prepare_backup_stream()?;
        let other_failure = Cell::new(false);
        room.with_native_backup_stream(principal, &other_failure, |mut native| {
            native.measure()?;
            let header = Header::new(&native.info, &rasters.identity, rasters.bytes)?;
            let prefix = format::prefix(&serde_json::to_vec(&header)?)?;
            let bytes_expected = prefix.len() as u64 + native.info.bytes + rasters.bytes;
            if bytes_expected > MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES {
                return Err(Error::Contract("joined generation complete budget"));
            }
            let mut output = BackupOutput {
                destination: writer,
                digest: ArchiveDigest::new(MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES),
                failed: &other_failure,
            };
            output.write_all(&prefix)?;
            native.write_to(&mut output)?;
            rasters.write_to(&mut output).inspect_err(|_| other_failure.set(true))?;
            output.flush()?;
            native.check()?;
            rasters.check().inspect_err(|_| other_failure.set(true))?;
            let (archive_sha256, bytes) = output.digest.finish();
            if bytes != bytes_expected {
                return Err(Error::Contract("streamed joined generation length differs"));
            }
            Ok(ServerLogGenerationRoomBackupInfo {
                format: "breditor/server-log-generation-room-backup",
                format_version: 1,
                identity: ServerLogGenerationRoomBackupIdentity {
                    native: header.native,
                    assets: header.assets,
                    archive_sha256,
                },
                bytes,
            })
        })
    }
}
