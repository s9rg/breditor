use serde::Serialize;

use crate::record::DecimalU64Record;

/// Stable identifier for Breditor's complete local-log checkpoint envelope.
pub(crate) const LOCAL_LOG_CHECKPOINT_FORMAT: &str = "breditor/local-log-checkpoint";

/// Durable local-log-checkpoint wire version implemented by this record.
pub(crate) const LOCAL_LOG_CHECKPOINT_FORMAT_VERSION: u32 = 1;

/// Generic V1 encoding record for a compacted prefix and its exact session.
///
/// This type intentionally does not implement `Deserialize`; untrusted fields,
/// tombstones, and the nested session pass through borrowed strict boundaries
/// before checked runtime reconstruction.
#[derive(Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct LocalLogCheckpointRecordV1<ReplayTombstones, SessionCheckpoint> {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    pub(crate) session_id: String,
    pub(crate) checkpoint_log_id: String,
    pub(crate) successor_log_id: String,
    pub(crate) covered_through: Option<DecimalU64Record>,
    pub(crate) replay_tombstones: ReplayTombstones,
    pub(crate) session_checkpoint: SessionCheckpoint,
}
