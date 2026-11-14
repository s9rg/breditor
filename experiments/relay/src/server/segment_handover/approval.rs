//! A separately selected commitment to the source epoch, backup and actual local restore.
use super::VerifiedRelaySegmentHandoverInputs;
use crate::{
    Error, RecoveredRelaySegmentRoom, RelaySegmentRoomBackupIdentity, Result, credentials,
    server::{RoomDeploymentSelection, deployment_fence::handover_selection},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Host-selected whole-room handover intent. Persist this separately before committing.
/// The authority journal decides whether the intent was committed.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelaySegmentHandoverApproval {
    format: String,
    format_version: u32,
    salt: String,
    backup: RelaySegmentRoomBackupIdentity,
    target: [u8; 32],
    previous: RoomDeploymentSelection,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    verified_inputs_sha256: Option<[u8; 32]>,
}

impl RelaySegmentHandoverApproval {
    /// Select a completed, untouched local restore and the exact old serving epoch.
    /// Retain the returned approval independently from room and archive files.
    ///
    /// # Errors
    /// Refuses a different source cut, changed custody, invalid epoch or advanced target.
    pub fn select(
        target: &RecoveredRelaySegmentRoom,
        backup: RelaySegmentRoomBackupIdentity,
        previous: RoomDeploymentSelection,
    ) -> Result<Self> {
        Self::select_with_inputs(target, backup, previous, None)
    }

    fn select_with_inputs(
        target: &RecoveredRelaySegmentRoom,
        backup: RelaySegmentRoomBackupIdentity,
        previous: RoomDeploymentSelection,
        verified_inputs_sha256: Option<[u8; 32]>,
    ) -> Result<Self> {
        let approval = Self {
            format: "breditor/relay-segment-handover".into(),
            format_version: 1,
            salt: credentials::issue()?,
            backup,
            target: target.handover_binding()?,
            previous,
            verified_inputs_sha256,
        };
        approval.check_target(target)?;
        target.check_fresh_handover_target()?;
        Ok(approval)
    }

    /// Select a restored target with complete protected streams and retained server asset inputs.
    /// Persist this approval separately before committing with the same held verification.
    ///
    /// # Errors
    /// Refuses mismatched backup or target custody, invalid epoch or advanced target.
    pub fn select_verified(
        target: &RecoveredRelaySegmentRoom,
        inputs: &VerifiedRelaySegmentHandoverInputs,
        previous: RoomDeploymentSelection,
    ) -> Result<Self> {
        inputs.check_target(target)?;
        Self::select_with_inputs(
            target,
            inputs.report().backup.clone(),
            previous,
            Some(inputs.digest()),
        )
    }

    pub(in crate::server) fn check_inputs(
        &self,
        inputs: Option<&VerifiedRelaySegmentHandoverInputs>,
    ) -> Result<()> {
        if self.verified_inputs_sha256 != inputs.map(VerifiedRelaySegmentHandoverInputs::digest) {
            return Err(Error::Contract(
                "relay segment handover requires the selected input proof",
            ));
        }
        Ok(())
    }

    pub(in crate::server) fn check_target(&self, target: &RecoveredRelaySegmentRoom) -> Result<()> {
        self.planned_selection()?;
        if self.verified_inputs_sha256.is_none() && target.requires_verified_handover() {
            return Err(Error::Contract("client raster restore requires verified handover"));
        }
        if target.handover_backup() != &self.backup
            || target.handover_binding()? != self.target
            || target.components().0.deployment_binding()? != self.previous.identity.binding
        {
            return Err(Error::Contract("relay segment handover approved target differs"));
        }
        Ok(())
    }

    /// Exact source data and asset cut that must still be current at commit.
    #[must_use]
    pub fn backup(&self) -> &RelaySegmentRoomBackupIdentity {
        &self.backup
    }

    /// Exact old serving epoch selected for replacement.
    #[must_use]
    pub fn previous_selection(&self) -> &RoomDeploymentSelection {
        &self.previous
    }

    /// Exact verified input report committed by the new epoch, if selected.
    #[must_use]
    pub fn verified_inputs_sha256(&self) -> Option<[u8; 32]> {
        self.verified_inputs_sha256
    }

    /// Exact planned first serving epoch of this target.
    ///
    /// # Errors
    /// Refuses unsupported or invalid approval data.
    pub fn planned_selection(&self) -> Result<RoomDeploymentSelection> {
        handover_selection(&self.previous, &self.nonce()?)
    }

    pub(in crate::server) fn nonce(&self) -> Result<[u8; 32]> {
        if self.format != "breditor/relay-segment-handover" || self.format_version != 1 {
            return Err(Error::Contract("relay segment handover approval format"));
        }
        credentials::hash(&self.salt)?;
        Ok(Sha256::digest(serde_json::to_vec(self)?).into())
    }

    pub(in crate::server) fn restart_nonce(&self, epoch: u64) -> Result<[u8; 32]> {
        Ok(Sha256::digest(serde_json::to_vec(&(
            "breditor/relay-segment-handover-restart/1",
            self.nonce()?,
            epoch,
        ))?)
        .into())
    }
}
