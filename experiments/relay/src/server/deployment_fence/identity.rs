//! Independently retained namespace and exact CAS choice. Detached data is not a lease.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};

/// Host-owned epoch namespace, separate from every room/archive/client credential.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoomDeploymentIdentity {
    /// Closed family, currently `breditor/room-deployment-authority`.
    pub format: String,
    /// Authority policy revision. Revision two requires verified transitions after handover.
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
    pub(in crate::server) fn requires_coordinated_recovery(&self) -> bool {
        self.format_version == 2
    }

    pub(super) fn validate(&self) -> Result<()> {
        if self.format != "breditor/room-deployment-authority"
            || !matches!(self.format_version, 1 | 2)
        {
            return Err(Error::Contract("deployment authority format"));
        }
        key(&self.authority)?;
        key(&self.binding)
    }
}
impl RoomDeploymentSelection {
    pub(super) fn validate_pin(&self) -> Result<u64> {
        self.identity.validate()?;
        let generation = self
            .generation
            .parse::<u64>()
            .map_err(|_| Error::Contract("deployment selected generation"))?;
        if generation.to_string() != self.generation || generation > super::journal::MAX_CLAIMS {
            return Err(Error::Contract("deployment selected generation"));
        }
        match (generation, self.owner.as_deref()) {
            (0, None) => {}
            (0, Some(_)) | (_, None) => return Err(Error::Contract("deployment selected owner")),
            (_, Some(owner)) => key(owner)?,
        }
        Ok(generation)
    }
}
