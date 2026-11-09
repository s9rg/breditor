//! Migrate the legacy server archive without changing its raster files or native receipts.
use super::{ServerRoomBackup, ServerRoomBackupIdentity};
use crate::{Error, Result, ServerLogGenerationOptions, ServerLogGenerationRoomBackup};

impl ServerRoomBackup {
    /// Prepare a generation archive from the exact independently selected original server backup.
    /// The original log becomes an immutable root and the exact raster archive is moved into
    /// the new envelope. Use `ServerLogGenerationRoomRecovery` to replay, verify and restore
    /// both components under a separate host-selected recovery destination.
    /// Keep the persisted original backup for retry. Preparation consumes this in-memory
    /// archive so it can transfer the raster bytes without duplicating the entire raster set.
    ///
    /// # Errors
    /// Wrong selection, invalid generation identities or framing/allocation bounds refuse.
    /// This step neither opens storage nor authorizes a deployment.
    pub fn prepare_generation_migration(
        self,
        expected: &ServerRoomBackupIdentity,
        options: &ServerLogGenerationOptions,
    ) -> Result<ServerLogGenerationRoomBackup> {
        if &self.identity != expected {
            return Err(Error::Contract("original migration selected server archive"));
        }
        let native = self.room.prepare_generation_migration(&expected.room, options)?;
        ServerLogGenerationRoomBackup::from_components(native, self.assets)
    }
}
