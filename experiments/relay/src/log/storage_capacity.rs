//! Capacity of the held append-only log without allocating a backup or rotating files.
use super::{Log, MAX_LOG, MAX_RECORD, MAX_RECORDS, generations};
use crate::{Error, Result};
use serde::Serialize;

/// Independent record and framed-byte headroom at a captured cut.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLogAllowance {
    /// Additional records within the described file or lifetime scope.
    pub records_remaining: u64,
    /// Additional on-disk frame bytes, including frame headers.
    pub framed_bytes_remaining: u64,
}

/// The physical resources required to rotate the actual selected generation.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLogRotationCapacity {
    /// Additional continuation files before the selected log reaches its lifetime file limit.
    pub continuation_files_remaining: usize,
    /// Unpublished staging files currently retained on disk.
    pub unpublished_stages: usize,
    /// Whether a new continuation and metadata can be staged at this cut.
    pub staging_available: bool,
    /// Whether the nonempty active WAL can rotate under the current file and staging limits.
    pub can_rotate: bool,
}

/// Detached capacity for the current durable log and its retained lineage.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerLogStorageCapacity {
    /// Original absolute position of the next record.
    pub next_sequence: String,
    /// Digest of the last admitted frame at the same cut.
    pub terminal_digest: [u8; 32],
    /// Headroom for records that fit the current WAL without rotation.
    pub active: ServerLogAllowance,
    /// Lifetime headroom across remaining file slots, assuming future rotations can stage.
    pub retained: ServerLogAllowance,
    /// Payload ceiling for an individual frame, before framing overhead.
    pub max_record_payload_bytes: u64,
    /// Physical rotation capacity. Original single-file logs have no rotation.
    pub rotation: Option<ServerLogRotationCapacity>,
}

impl Log {
    pub(crate) fn storage_capacity(&self) -> Result<ServerLogStorageCapacity> {
        self.ready()?;
        if self.file.metadata()?.len() != self.bytes {
            return Err(Error::Contract("log storage capacity active length differs"));
        }
        let (active_records, closed_bytes, rotation) = if let Some(state) = &self.generations {
            let unpublished_stages = state.rotation_stage_count()?;
            let continuation_files_remaining = state.remaining_rotation_slots();
            let staging_available =
                generations::Generations::can_stage_rotation(unpublished_stages);
            (
                self.next - state.active_first(),
                state.closed_bytes(),
                Some(ServerLogRotationCapacity {
                    continuation_files_remaining,
                    unpublished_stages,
                    staging_available,
                    can_rotate: staging_available
                        && continuation_files_remaining != 0
                        && self.next != state.active_first(),
                }),
            )
        } else {
            (self.next, 0, None)
        };
        self.ready()?;
        let retained_bytes_limit =
            if rotation.is_some() { generations::MAX_PHYSICAL_LOG_BYTES } else { MAX_LOG };
        let retained_bytes = retained_bytes_limit
            .checked_sub(closed_bytes + self.bytes)
            .ok_or(Error::Contract("log storage capacity retained byte budget"))?;
        let active_bytes = MAX_LOG
            .checked_sub(self.bytes)
            .ok_or(Error::Contract("log storage capacity active byte budget"))?;
        let active = ServerLogAllowance {
            records_remaining: MAX_RECORDS
                .checked_sub(active_records)
                .ok_or(Error::Contract("log storage capacity record budget"))?,
            framed_bytes_remaining: active_bytes.min(retained_bytes),
        };
        let new_files = rotation.map_or(0, |value| value.continuation_files_remaining as u64);
        Ok(ServerLogStorageCapacity {
            next_sequence: self.next.to_string(),
            terminal_digest: self.previous,
            active,
            retained: ServerLogAllowance {
                records_remaining: active.records_remaining + new_files * MAX_RECORDS,
                framed_bytes_remaining: retained_bytes.min(active_bytes + new_files * MAX_LOG),
            },
            max_record_payload_bytes: MAX_RECORD,
            rotation,
        })
    }
}
