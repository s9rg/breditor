//! Owner-selected complete server registrations and private non-mutating credential verification.
mod capture;
mod codec;
mod credentials;
#[cfg(test)]
mod tests;
mod types;

pub use codec::MAX_ROOM_PARTICIPANT_INVENTORY_BYTES;
pub use credentials::{RecoveryRegistrationCoverage, VerifiedRecoveryRegistrations};
pub use types::*;

/// Immutable bounded inventory metadata. Reading a file does not prove native replay or authority.
/// Native capture/verification and host authentication remain separately required.
#[derive(Clone)]
pub struct RoomParticipantInventory {
    metadata: RoomParticipantInventoryMetadata,
    json: String,
    identity: RoomParticipantInventoryIdentity,
}

impl RoomParticipantInventory {
    /// Detached registrations and room grants; no resume secrets, credential digests or live leases.
    #[must_use]
    pub fn metadata(&self) -> RoomParticipantInventoryMetadata {
        self.metadata.clone()
    }
    /// Independently retain this exact inventory and original server-cut selection.
    #[must_use]
    pub fn identity(&self) -> RoomParticipantInventoryIdentity {
        self.identity.clone()
    }
    /// Exact original canonical UTF-8 bytes. This is private owner/maintenance metadata.
    #[must_use]
    pub fn to_json(&self) -> &str {
        &self.json
    }
}
