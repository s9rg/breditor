//! Explicit physical storage actions; no original file API infers this separate family.
mod backup;
mod control_seal;
#[cfg(test)]
pub(in crate::room) use server_recovery::tests::source as joined_generation_source_for_test;
mod server_backup;
mod server_recovery;
pub use server_backup::{
    MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupIdentity, ServerLogGenerationRoomBackupInfo,
};
pub use server_recovery::{
    RecoveredLogGenerationServerRoom, ServerLogGenerationRoomRecovery,
    ServerLogGenerationRoomRecoveryProgress,
};
mod participants;
pub use participants::{
    GenerationRecoveryRegistrationCoverage, MAX_GENERATION_PARTICIPANT_INVENTORY_BYTES,
    ServerLogGenerationParticipantIdentity, ServerLogGenerationParticipantInventory,
    ServerLogGenerationParticipantMetadata, VerifiedGenerationRecoveryRegistrations,
};
mod recovery;
pub use recovery::{
    RecoveredLogGenerationRoom, ServerLogGenerationRecovery, ServerLogGenerationRecoveryProgress,
};
mod create;
mod create_atomic_v2;
mod descriptor;
mod open;
mod rotate;
pub use backup::{
    MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, ServerLogGenerationBackup,
    ServerLogGenerationBackupIdentity, ServerLogGenerationBackupInfo,
};
#[cfg(test)]
pub(in crate::room) mod tests;
