//! Detached native registration metadata bound to the whole distinct physical archive.
use super::super::ServerLogGenerationBackupIdentity;
use crate::RoomParticipantInventoryMetadata;
use serde::{Deserialize, Serialize};

/// Independently retain this selection; it grants neither current access nor a writer lease.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerLogGenerationParticipantIdentity {
    /// Complete native cut, physical manifest and entire archive digest, not just document clocks.
    pub source: ServerLogGenerationBackupIdentity,
    /// SHA-256 of the complete canonical inventory file, never an authentication secret.
    pub sha256: [u8; 32],
}

/// Closed distinct family composed with the unchanged detached native-participant declaration.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerLogGenerationParticipantMetadata {
    /// Separate physical-generation participant inventory family.
    pub format: String,
    /// Exact outer inventory revision, currently one.
    pub format_version: u32,
    /// Entire selected physical archive, including retained unpublished stages.
    pub source: ServerLogGenerationBackupIdentity,
    /// Complete original native declaration; not proof that original storage readers accept it.
    pub native: RoomParticipantInventoryMetadata,
}

/// Immutable generation-bound inventory. Metadata admission alone never proves native state.
#[derive(Clone)]
pub struct ServerLogGenerationParticipantInventory {
    pub(super) metadata: ServerLogGenerationParticipantMetadata,
    pub(super) json: String,
    pub(super) identity: ServerLogGenerationParticipantIdentity,
}
impl ServerLogGenerationParticipantInventory {
    /// Detached complete native declarations; no secrets or active connection leases.
    #[must_use]
    pub fn metadata(&self) -> ServerLogGenerationParticipantMetadata {
        self.metadata.clone()
    }
    /// Separately retain the full selected archive and exact inventory before recovery.
    #[must_use]
    pub fn identity(&self) -> ServerLogGenerationParticipantIdentity {
        self.identity.clone()
    }
    /// Exact private owner/maintenance metadata; this is not an interchangeable original file.
    #[must_use]
    pub fn to_json(&self) -> &str {
        &self.json
    }
}
