//! Host-selected source seal for a complete portable backup.
use crate::{
    Error, Result, credentials,
    server::{
        LogGenerationHandoverStatus, RelaySegmentPortableBackupIdentity,
        RelaySegmentRetainedBackup, RoomDeploymentAuthority, RoomDeploymentSelection,
        ServerBackupHandle, deployment_fence, generation_backup::durable::Interruption,
    },
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

/// An independently retained decision to stop one serving epoch at an exact portable backup.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentPortableSeal {
    format_version: u32,
    salt: String,
    backup: RelaySegmentPortableBackupIdentity,
}

impl RelaySegmentPortableSeal {
    /// Create an intent. Retain it independently before the real source seal.
    ///
    /// # Errors
    /// Refuses invalid source selection or unavailable entropy.
    pub fn select(backup: RelaySegmentPortableBackupIdentity) -> Result<Self> {
        let result = Self { format_version: 1, salt: credentials::issue()?, backup };
        result.planned_selection()?;
        Ok(result)
    }

    /// The exact portable data approved for this operation.
    #[must_use]
    pub fn backup(&self) -> &RelaySegmentPortableBackupIdentity {
        &self.backup
    }

    /// The authority selection that records the durable source seal.
    ///
    /// # Errors
    /// Refuses unsupported selection data or an invalid serving epoch.
    pub fn planned_selection(&self) -> Result<RoomDeploymentSelection> {
        deployment_fence::handover_selection(&self.backup.retained.source_epoch, &self.nonce()?)
    }

    /// Inspect whether this exact source seal was written to the actual authority.
    /// A sealed decision can remain in history after it stops being current.
    ///
    /// # Errors
    /// Refuses unrelated or uncertain authority.
    pub fn status(
        &self,
        authority: &RoomDeploymentAuthority,
    ) -> Result<LogGenerationHandoverStatus> {
        deployment_fence::prepared_decision_status(
            authority,
            &self.backup.retained.source_epoch,
            &self.planned_selection()?,
        )
    }

    pub(in crate::server) fn nonce(&self) -> Result<[u8; 32]> {
        if self.format_version != 1 {
            return Err(Error::Contract("portable relay seal format"));
        }
        credentials::hash(&self.salt)?;
        Ok(Sha256::digest(serde_json::to_vec(&("breditor/relay-portable-seal/1", self))?).into())
    }
}

impl ServerBackupHandle {
    /// After the owner has saved the intent, verify the portable bundle and seal the exact live cut.
    /// A seal fences the old host and issues no usable serving lease.
    /// Inspect the actual authority after an interrupted result. Run off async I/O workers.
    ///
    /// # Errors
    /// Refuses changed source or bundle, incomplete inputs, incorrect owner authentication and stale epochs.
    pub fn seal_portable_relay_segment(
        &self,
        principal: &str,
        token: &str,
        path: &Path,
        intent: &RelaySegmentPortableSeal,
    ) -> Result<RoomDeploymentSelection> {
        self.seal_portable_relay_segment_with_interruption(
            principal,
            token,
            path,
            intent,
            &Interruption::default(),
        )
    }

    pub(super) fn seal_portable_relay_segment_with_interruption(
        &self,
        principal: &str,
        token: &str,
        path: &Path,
        intent: &RelaySegmentPortableSeal,
        stop: &Interruption,
    ) -> Result<RoomDeploymentSelection> {
        let host = &self.host;
        host.authentication.authenticate(principal, token)?;
        intent.planned_selection()?;
        host.deployment.fenced(|lease| {
            if lease.selection() != intent.backup.retained.source_epoch {
                return Err(Error::Lease);
            }
            deployment_fence::transaction(Some(lease), || {
                host.room
                    .lock()
                    .map_err(|_| Error::NeedsRecovery)?
                    .recovery_inventory_owner(principal)
            })
        })?;
        let bundle = RelaySegmentRetainedBackup::open_portable(path, intent.backup())?;
        deployment_fence::seal_portable_segment(host, principal, intent, &bundle, stop)
    }
}
