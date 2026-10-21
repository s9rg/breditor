//! Separate exact-archive participant capture and native/protected-input checks, not activation.
mod capture;
mod codec;
mod credentials;
mod inventory;
#[cfg(test)]
mod tests;
pub use codec::MAX_GENERATION_PARTICIPANT_INVENTORY_BYTES;
pub use credentials::{
    GenerationRecoveryRegistrationCoverage, VerifiedGenerationRecoveryRegistrations,
};
pub use inventory::{
    ServerLogGenerationParticipantIdentity, ServerLogGenerationParticipantInventory,
    ServerLogGenerationParticipantMetadata,
};
