//! Closed metadata integrity only. Actual native replay and registration continuity are separate.
use super::{
    ServerLogGenerationParticipantIdentity, ServerLogGenerationParticipantInventory,
    ServerLogGenerationParticipantMetadata,
};
use crate::{
    Error, MAX_ROOM_PARTICIPANT_INVENTORY_BYTES, Result, RoomParticipantInventory,
    RoomParticipantInventoryIdentity,
};
use sha2::{Digest, Sha256};

/// Original complete native metadata plus an independently bounded outer physical selection.
pub const MAX_GENERATION_PARTICIPANT_INVENTORY_BYTES: usize =
    MAX_ROOM_PARTICIPANT_INVENTORY_BYTES + 128 * 1024;

impl ServerLogGenerationParticipantInventory {
    pub(super) fn encode(metadata: &ServerLogGenerationParticipantMetadata) -> Result<Self> {
        let json = serde_json::to_string(metadata)?;
        let expected = ServerLogGenerationParticipantIdentity {
            source: metadata.source.clone(),
            sha256: Sha256::digest(json.as_bytes()).into(),
        };
        Self::from_json(&json, &expected)
    }
    /// Admit a complete closed file against an independently selected physical archive and hash.
    /// Performs no native replay, current authentication, credential matching or activation.
    /// # Errors
    /// Wrong family/selection, unknown fields, noncanonical bytes and whole metadata bounds refuse.
    pub fn from_json(
        input: &str,
        expected: &ServerLogGenerationParticipantIdentity,
    ) -> Result<Self> {
        if input.len() > MAX_GENERATION_PARTICIPANT_INVENTORY_BYTES
            || <[u8; 32]>::from(Sha256::digest(input.as_bytes())) != expected.sha256
        {
            return Err(Error::Contract("generation participant inventory selected bytes"));
        }
        let metadata: ServerLogGenerationParticipantMetadata = serde_json::from_str(input)?;
        if metadata.format != "breditor/server-log-generation-participants"
            || metadata.format_version != 1
            || metadata.source != expected.source
            || metadata.native.room != metadata.source.source
            || serde_json::to_string(&metadata)? != input
        {
            return Err(Error::Contract("generation participant inventory closed metadata"));
        }
        let native = serde_json::to_string(&metadata.native)?;
        RoomParticipantInventory::from_json(
            &native,
            &RoomParticipantInventoryIdentity {
                room: metadata.source.source.clone(),
                sha256: Sha256::digest(native.as_bytes()).into(),
            },
        )?;
        Ok(Self { metadata, json: input.into(), identity: expected.clone() })
    }
}
