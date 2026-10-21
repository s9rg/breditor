//! Explicit physical storage actions; no original file API infers this separate family.
mod backup;
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
