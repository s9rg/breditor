//! Independently pinned relay state at a sealed WAL boundary.
mod physical_closure;
mod restore;
mod state;
#[cfg(all(test, feature = "server"))]
mod tests;

use crate::{Error, Result, Room, RoomBackupIdentity};
pub(super) use physical_closure::PhysicalClosure;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
pub(super) use state::Checkpoint;
pub(in crate::room) use state::ReplicaCheckpoint;
use std::io::Write;

use super::asset_references::PacketHistory;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum SegmentCheckpointEncoding {
    Original,
    IndexedAssetHistory,
    Compactable,
}

impl SegmentCheckpointEncoding {
    fn version(self) -> u32 {
        match self {
            Self::Original => 1,
            Self::IndexedAssetHistory => 2,
            Self::Compactable => 3,
        }
    }

    pub(super) fn has_asset_history(self) -> bool {
        self != Self::Original
    }
}

/// Independently retain this identity in host recovery configuration.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelayCheckpointIdentity {
    /// Exact logical cut, including immutable room and compiler identity.
    pub source: RoomBackupIdentity,
    /// Manifest that closed the checkpoint's final WAL.
    pub manifest: [u8; 32],
    /// Exact checkpoint payload digest.
    pub sha256: [u8; 32],
}

/// Bounded checkpoint data. Reading it grants no room lease or deployment authority.
pub struct RelayCheckpoint {
    identity: RelayCheckpointIdentity,
    bytes: Vec<u8>,
}

// The document, review and effect lanes have separate history bounds.
// This combined limit also caps the original catalog and receipt indexes.
pub(super) const MAX_CHECKPOINT_BYTES: usize = 512 * 1024 * 1024;
const FORMAT: &str = "breditor/relay-materialized-checkpoint";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Header {
    format: String,
    format_version: u32,
    source: RoomBackupIdentity,
    manifest: [u8; 32],
    #[serde(default, deserialize_with = "present")]
    asset_packet_history: Option<PacketHistory>,
    #[serde(default, deserialize_with = "present")]
    archive_closure: Option<PhysicalClosure>,
}

pub(super) struct SelectedHeader {
    pub(super) encoding: SegmentCheckpointEncoding,
    pub(super) history: Option<PacketHistory>,
    pub(super) closure: Option<PhysicalClosure>,
}

fn present<'de, T: Deserialize<'de>, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<T>, D::Error> {
    T::deserialize(deserializer).map(Some)
}

impl Header {
    pub(super) fn select(
        self,
        expected: &RelayCheckpointIdentity,
        first_sequence: u64,
    ) -> Result<SelectedHeader> {
        let encoding = check_selection(
            &self.format,
            self.format_version,
            &self.source,
            self.manifest,
            (self.asset_packet_history.is_some(), self.archive_closure.is_some()),
            expected,
        )?;
        if let Some(history) = &self.asset_packet_history {
            history.check_range(first_sequence, self.source.records)?;
        }
        Ok(SelectedHeader {
            encoding,
            history: self.asset_packet_history,
            closure: self.archive_closure,
        })
    }
}

fn check_selection(
    format: &str,
    format_version: u32,
    source: &RoomBackupIdentity,
    manifest: [u8; 32],
    extensions: (bool, bool),
    expected: &RelayCheckpointIdentity,
) -> Result<SegmentCheckpointEncoding> {
    let encoding = match extensions {
        (false, false) => SegmentCheckpointEncoding::Original,
        (true, false) => SegmentCheckpointEncoding::IndexedAssetHistory,
        (true, true) => SegmentCheckpointEncoding::Compactable,
        (false, true) => return Err(Error::Contract("physical closure requires asset history")),
    };
    if format != FORMAT
        || format_version != encoding.version()
        || source != &expected.source
        || manifest != expected.manifest
    {
        return Err(Error::Contract("relay checkpoint selected cut differs"));
    }
    Ok(encoding)
}

pub(in crate::room) fn sequence(value: &str, end: u64) -> Result<u64> {
    let index = value.parse::<u64>().map_err(|_| Error::Contract("relay checkpoint sequence"))?;
    if index == 0 || index >= end || index.to_string() != value {
        return Err(Error::Contract("relay checkpoint sequence differs"));
    }
    Ok(index)
}

impl RelayCheckpoint {
    /// Read this artifact's independently retainable identity.
    #[must_use]
    pub fn identity(&self) -> &RelayCheckpointIdentity {
        &self.identity
    }

    /// The exact artifact bytes. Treat these as private room storage.
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Admit only the bytes selected by a trusted host identity.
    /// # Errors
    /// Rejects a changed identity, invalid checkpoint or oversized input.
    pub fn from_bytes(bytes: Vec<u8>, expected: &RelayCheckpointIdentity) -> Result<Self> {
        if bytes.is_empty() || bytes.len() > MAX_CHECKPOINT_BYTES {
            return Err(Error::Contract("relay checkpoint byte budget"));
        }
        if <[u8; 32]>::from(Sha256::digest(&bytes)) != expected.sha256 {
            return Err(Error::Contract("relay checkpoint digest differs"));
        }
        let value: Header = serde_json::from_slice(&bytes)?;
        if value.select(expected, 0)?.encoding.has_asset_history() {
            return Err(Error::Contract("indexed checkpoint requires a relay segment"));
        }
        Ok(Self { identity: expected.clone(), bytes })
    }
}

struct BoundedBytes(Vec<u8>);
impl Write for BoundedBytes {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        if data.len() > MAX_CHECKPOINT_BYTES - self.0.len() {
            return Err(std::io::Error::other("relay checkpoint byte budget"));
        }
        self.0.extend_from_slice(data);
        Ok(data.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl Room {
    /// Snapshot the exact room state immediately after sealing its final nonempty WAL.
    /// Keep the identity separately from the artifact and preserve the original WALs.
    /// # Errors
    /// Refuses non-owner callers, a nonempty active WAL, uncertain custody or over-budget state.
    pub fn materialize_relay_checkpoint(&self, principal: &str) -> Result<RelayCheckpoint> {
        self.recovery_inventory_owner(principal)?;
        let (manifest, records, previous) = self.log.materialized_checkpoint_cut()?;
        let source = self.native_identity_at(records, previous);
        let mut bytes = BoundedBytes(Vec::new());
        let value = Checkpoint::capture(self, source.clone(), manifest)?;
        serde_json::to_writer(&mut bytes, &value)?;
        self.log.ready()?;
        let sha256 = Sha256::digest(&bytes.0).into();
        Ok(RelayCheckpoint {
            identity: RelayCheckpointIdentity { source, manifest, sha256 },
            bytes: bytes.0,
        })
    }
}
