//! Distinct joined native log/raster archive; old component families stay closed and unchanged.
mod admission;
mod ancestry;
#[cfg(test)]
mod ancestry_tests;
mod archive;
mod capture;
mod check_disk;
mod disk;
pub use disk::ServerLogGenerationRoomBackupFile;
mod compose;
mod format;
mod identity;
mod stage_reclamation;
#[cfg(test)]
mod stage_reclamation_tests;
mod stream;
#[cfg(test)]
mod stream_tests;
#[cfg(test)]
mod tests;
mod verify_components;
pub use archive::ServerLogGenerationRoomBackup;
pub use format::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES;
pub use identity::{ServerLogGenerationRoomBackupIdentity, ServerLogGenerationRoomBackupInfo};
