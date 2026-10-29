//! A selected native-service decision is DATA, not a room-wide closure or a lease.
use super::ServerLogGenerationRecoveryStateIdentity;
use crate::{
    Error, Result,
    server::{PreparedLogGenerationHandoverIdentity, RoomDeploymentSelection, deployment_fence},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Independently retain before activation. Commits to the exact durable source
/// intent and whole current native/raster/registration cut. Does not assert that
/// browser queues, provider mappings or review/version packets are reconciled.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeLogGenerationActivationIdentity {
    format: String,
    format_version: u32,
    source: PreparedLogGenerationHandoverIdentity,
    current: ServerLogGenerationRecoveryStateIdentity,
    planned: RoomDeploymentSelection,
}
impl NativeLogGenerationActivationIdentity {
    pub(in crate::server) fn new(
        source: PreparedLogGenerationHandoverIdentity,
        current: ServerLogGenerationRecoveryStateIdentity,
    ) -> Result<Self> {
        source.validate()?;
        if source.source() != &current.origin
            || current.participants.source != current.server.native
        {
            return Err(Error::Contract("native activation selected sources differ"));
        }
        let mut result = Self {
            format: "breditor/native-generation-service-activation".into(),
            format_version: 1,
            planned: source.planned_selection().clone(),
            source,
            current,
        };
        result.planned = deployment_fence::handover_selection(
            result.source.planned_selection(),
            &result.nonce()?,
        )?;
        Ok(result)
    }
    pub(in crate::server) fn nonce(&self) -> Result<[u8; 32]> {
        Ok(Sha256::digest(serde_json::to_vec(&(
            "breditor/native-generation-service-epoch/1",
            &self.source,
            &self.current,
        ))?)
        .into())
    }
    /// Actual immutable source intent selection. No saved identity supplies its locks.
    #[must_use]
    pub fn source(&self) -> &PreparedLogGenerationHandoverIdentity {
        &self.source
    }
    /// Complete native/raster/registration selection, never a browser/provider closure.
    #[must_use]
    pub fn current(&self) -> &ServerLogGenerationRecoveryStateIdentity {
        &self.current
    }
    /// Exact planned native-service epoch. Its appearance in DATA is not evidence
    /// that it was appended. An independently pinned actual ledger can resolve it.
    #[must_use]
    pub fn planned_selection(&self) -> &RoomDeploymentSelection {
        &self.planned
    }
}
