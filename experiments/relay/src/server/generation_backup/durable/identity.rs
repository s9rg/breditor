//! Canonical complete intent determines its nonce; a counter is not a source commitment.
use crate::{
    Error, Result, ServerLogGenerationRoomBackupIdentity, credentials,
    log::generations::{GenerationDirectoryWitness, GenerationFileWitness},
    server::{RoomDeploymentSelection, deployment_fence},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Detached private source/epoch choice. Deserialize admits DATA, never serving authority.
/// Its actual directory and immutable file witnesses are not portable deployment custody.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreparedLogGenerationHandoverIdentity {
    format: String,
    format_version: u32,
    salt: String,
    pub(in crate::server) source: ServerLogGenerationRoomBackupIdentity,
    pub(in crate::server) previous: RoomDeploymentSelection,
    pub(in crate::server) sealed: RoomDeploymentSelection,
    pub(super) root: GenerationDirectoryWitness,
    pub(super) archive_file: GenerationFileWitness,
    pub(super) intent_file: GenerationFileWitness,
    pub(super) bytes: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Commitment<'a> {
    format: &'static str,
    salt: &'a str,
    source: &'a ServerLogGenerationRoomBackupIdentity,
    previous: &'a RoomDeploymentSelection,
    root: &'a GenerationDirectoryWitness,
    archive_file: GenerationFileWitness,
    intent_file: GenerationFileWitness,
    bytes: u64,
}
impl PreparedLogGenerationHandoverIdentity {
    pub(super) fn new(
        source: ServerLogGenerationRoomBackupIdentity,
        previous: RoomDeploymentSelection,
        root: GenerationDirectoryWitness,
        archive_file: GenerationFileWitness,
        intent_file: GenerationFileWitness,
        bytes: u64,
    ) -> Result<Self> {
        let mut value = Self {
            format: "breditor/prepared-generation-source-handover".into(),
            format_version: 1,
            salt: credentials::issue()?,
            source,
            sealed: previous.clone(),
            previous,
            root,
            archive_file,
            intent_file,
            bytes,
        };
        value.sealed = deployment_fence::handover_selection(&value.previous, &value.nonce()?)?;
        value.validate()?;
        Ok(value)
    }
    pub(in crate::server) fn nonce(&self) -> Result<[u8; 32]> {
        let body = Commitment {
            format: "breditor/generation-source-epoch-commitment/1",
            salt: &self.salt,
            source: &self.source,
            previous: &self.previous,
            root: &self.root,
            archive_file: self.archive_file,
            intent_file: self.intent_file,
            bytes: self.bytes,
        };
        Ok(Sha256::digest(serde_json::to_vec(&body)?).into())
    }
    pub(in crate::server) fn validate(&self) -> Result<()> {
        if self.format != "breditor/prepared-generation-source-handover"
            || self.format_version != 1
            || self.bytes == 0
            || self.bytes > crate::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES
        {
            return Err(Error::Contract("prepared handover identity or byte budget"));
        }
        credentials::hash(&self.salt)?;
        if deployment_fence::handover_selection(&self.previous, &self.nonce()?)? != self.sealed {
            return Err(Error::Contract("prepared handover source commitment differs"));
        }
        Ok(())
    }
    /// Complete source choice, independent from epoch counters and provider declarations.
    #[must_use]
    pub fn source(&self) -> &ServerLogGenerationRoomBackupIdentity {
        &self.source
    }
    /// Previous serving epoch, not permission to reconstruct its lease.
    #[must_use]
    pub fn previous_selection(&self) -> &RoomDeploymentSelection {
        &self.previous
    }
    /// Exact planned source-bound nonce. Its presence in DATA does not mean it was appended.
    #[must_use]
    pub fn planned_selection(&self) -> &RoomDeploymentSelection {
        &self.sealed
    }
}
