//! Explicit physical storage actions; no original file API infers this separate family.
mod archive_sealed_wal;
mod backup;
mod control_seal;
#[cfg(test)]
pub(in crate::room) use server_recovery::tests::source as joined_generation_source_for_test;
mod server_backup;
mod server_recovery;
pub use server_backup::{
    MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES, ServerLogGenerationRoomBackup,
    ServerLogGenerationRoomBackupFile, ServerLogGenerationRoomBackupIdentity,
    ServerLogGenerationRoomBackupInfo,
};
#[cfg(feature = "server")]
pub(crate) use server_recovery::GenerationOperationCustody;
#[cfg(feature = "server")]
pub(crate) use server_recovery::HostOrigin;
pub use server_recovery::{
    InspectedNativeGenerationTail, OperationalLogGenerationServerRoom,
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
mod recovery_part;
pub use recovery::{
    RecoveredLogGenerationRoom, ServerLogGenerationRecovery, ServerLogGenerationRecoveryProgress,
};
mod create;
mod create_atomic_v2;
mod descriptor;
mod open;
mod pack_sealed_wal;
mod rotate;
pub use backup::{
    MAX_SERVER_LOG_GENERATION_BACKUP_BYTES, RelaySegmentBaseFile, RelaySegmentBaseIdentity,
    ServerLogGenerationBackup, ServerLogGenerationBackupIdentity, ServerLogGenerationBackupInfo,
};
#[cfg(test)]
pub(in crate::room) mod tests;
