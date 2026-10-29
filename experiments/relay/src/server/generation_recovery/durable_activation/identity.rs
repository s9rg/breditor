//! Canonical checkpoint/actual-owner commitment, independent from old warm-only choices.
use super::super::ServerLogGenerationRecoveryStateIdentity;
use crate::{
    Error, Result, credentials,
    log::generations::{GenerationDirectoryWitness, GenerationFileWitness},
    server::{PreparedLogGenerationHandoverIdentity, RoomDeploymentSelection, deployment_fence},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
/// DATA only: a complete target cut, original source, same operational owner,
/// exact prior epoch and actual checkpoint files. No serde-created native grant.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreparedNativeGenerationActivationIdentity {
    pub(super) format: String,
    pub(super) format_version: u32,
    pub(super) salt: String,
    pub(super) source: PreparedLogGenerationHandoverIdentity,
    pub(super) current: ServerLogGenerationRecoveryStateIdentity,
    pub(super) operation: [u8; 32],
    pub(super) previous: RoomDeploymentSelection,
    pub(super) parent: Option<[u8; 32]>,
    pub(super) planned: RoomDeploymentSelection,
    pub(super) root: GenerationDirectoryWitness,
    pub(super) archive: GenerationFileWitness,
    pub(super) intent: GenerationFileWitness,
    pub(super) bytes: u64,
}
impl PreparedNativeGenerationActivationIdentity {
    pub(in crate::server) fn nonce(&self) -> Result<[u8; 32]> {
        Ok(Sha256::digest(serde_json::to_vec(&(
            "breditor/durable-native-activation-epoch/1",
            &self.salt,
            &self.source,
            &self.current,
            &self.operation,
            &self.previous,
            &self.parent,
            &self.root,
            &self.archive,
            &self.intent,
            self.bytes,
        ))?)
        .into())
    }
    pub(in crate::server) fn validate(&self) -> Result<()> {
        if self.format != "breditor/prepared-native-generation-activation"
            || self.format_version != 1
            || self.bytes == 0
            || self.bytes > crate::MAX_SERVER_LOG_GENERATION_ROOM_BACKUP_BYTES
            || self.source.source() != &self.current.origin
            || self.current.participants.source != self.current.server.native
            || self.previous.identity != self.source.planned_selection().identity
            || self.parent.is_none() && self.previous != *self.source.planned_selection()
        {
            return Err(Error::Contract("native checkpoint identity or source differs"));
        }
        self.source.validate()?;
        credentials::hash(&self.salt)?;
        if deployment_fence::handover_selection(&self.previous, &self.nonce()?)? != self.planned {
            return Err(Error::Contract("native checkpoint epoch commitment differs"));
        }
        Ok(())
    }
    pub(in crate::server) fn digest(&self) -> Result<[u8; 32]> {
        Ok(Sha256::digest(serde_json::to_vec(self)?).into())
    }
    /// Original immutable source choice. Not executable original custody.
    #[must_use]
    pub fn source(&self) -> &PreparedLogGenerationHandoverIdentity {
        &self.source
    }
    /// Complete selected target state. A clock projection does not substitute it.
    #[must_use]
    pub fn current(&self) -> &ServerLogGenerationRecoveryStateIdentity {
        &self.current
    }
    /// Exact previous serving epoch, not permission to revive its lease.
    #[must_use]
    pub fn previous_selection(&self) -> &RoomDeploymentSelection {
        &self.previous
    }
    /// Planned target-bound epoch DATA; status must inspect the actual ledger.
    #[must_use]
    pub fn planned_selection(&self) -> &RoomDeploymentSelection {
        &self.planned
    }
    pub(in crate::server) fn operation(&self) -> [u8; 32] {
        self.operation
    }
}
