//! Independently retained namespace and exact CAS choice. Detached data is not a lease.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};

/// Host-owned epoch namespace, separate from every room/archive/client credential.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoomDeploymentIdentity {
    /// Closed family, currently `breditor/room-deployment-authority`.
    pub format: String,
    /// Closed revision, currently one.
    pub format_version: u32,
    /// Random immutable authority identity, not account authentication.
    pub authority: String,
    /// Exact immutable native room/profile/transport binding.
    pub binding: String,
}
/// Point-in-time operator choice for compare-and-swap, never a serving capability.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoomDeploymentSelection {
    /// Independently selected authority, never a room-backup-selected path.
    pub identity: RoomDeploymentIdentity,
    /// Canonical decimal epoch. Zero has never granted a lease.
    pub generation: String,
    /// Exact nonce at this epoch; absent only at generation zero.
    pub owner: Option<String>,
}
pub(super) fn key(value: &str) -> Result<()> {
    if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return Err(Error::Contract("deployment authority identity"));
    }
    Ok(())
}
impl RoomDeploymentIdentity {
    pub(super) fn validate(&self) -> Result<()> {
        if self.format != "breditor/room-deployment-authority" || self.format_version != 1 {
            return Err(Error::Contract("deployment authority format"));
        }
        key(&self.authority)?;
        key(&self.binding)
    }
}
