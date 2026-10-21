//! Distinct joined native log/raster archive; old component families stay closed and unchanged.
mod admission;
mod archive;
mod capture;
mod format;
mod identity;
#[cfg(test)]
mod tests;
mod verify_components;
pub use archive::ServerLogGenerationRoomBackup;
pub use format::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES;
pub use identity::{ServerLogGenerationRoomBackupIdentity, ServerLogGenerationRoomBackupInfo};
