//! Independent bounded metadata integrity, never native replay or current authentication.
use super::{
    RoomParticipantInventory, RoomParticipantInventoryIdentity, RoomParticipantInventoryMetadata,
};
use crate::{Error, Result};
use sha2::{Digest, Sha256};

/// Independent metadata refusal ceiling; original room, writer and actor budgets are unchanged.
pub const MAX_ROOM_PARTICIPANT_INVENTORY_BYTES: usize = 4 * 1024 * 1024;

impl RoomParticipantInventory {
    pub(super) fn encode(metadata: RoomParticipantInventoryMetadata) -> Result<Self> {
        let json = serde_json::to_string(&metadata)?;
        if json.len() > MAX_ROOM_PARTICIPANT_INVENTORY_BYTES {
            return Err(Error::Contract("participant inventory byte budget"));
        }
        let identity = RoomParticipantInventoryIdentity {
            room: metadata.room.clone(),
            sha256: Sha256::digest(json.as_bytes()).into(),
        };
        Ok(Self { metadata, json, identity })
    }

    /// Admit exact closed metadata against an independently selected complete file and room cut.
    /// This performs no I/O, authentication, native replay, credential validation or activation.
    /// # Errors
    /// Rejects unknown fields/families, noncanonical bytes, excessive input or selected-cut mismatch.
    pub fn from_json(input: &str, expected: &RoomParticipantInventoryIdentity) -> Result<Self> {
        if input.len() > MAX_ROOM_PARTICIPANT_INVENTORY_BYTES {
            return Err(Error::Contract("participant inventory byte budget"));
        }
        if <[u8; 32]>::from(Sha256::digest(input.as_bytes())) != expected.sha256 {
            return Err(Error::Contract("participant inventory selected bytes"));
        }
        let metadata: RoomParticipantInventoryMetadata = serde_json::from_str(input)?;
        if metadata.format != "breditor/room-participant-inventory"
            || metadata.format_version != 1
            || metadata.room != expected.room
            || metadata.writers.len() > 1024
            || metadata.review.as_ref().is_some_and(|r| r.writers.len() > 1023)
            || metadata.accounts.len() > 5120
            || metadata.server_authors.len() > 2
            || serde_json::to_string(&metadata)? != input
        {
            return Err(Error::Contract("participant inventory closed metadata"));
        }
        Ok(Self { metadata, json: input.into(), identity: expected.clone() })
    }
}
