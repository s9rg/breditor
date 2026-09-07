use serde::{Serialize, ser::SerializeStruct};

use crate::{record::DecimalU64Record, state::EditorContext};

use super::{
    local_log_checkpoint_json::LOCAL_LOG_CHECKPOINT_FORMAT,
    local_log_checkpoint_json_v2::LOCAL_LOG_CHECKPOINT_V2_FORMAT_VERSION,
    schema_binding_encoding::SchemaBindingEncoding,
};

/// Borrowed deterministic outer encoding of one Local Log Checkpoint V2 value.
pub(crate) struct LocalLogCheckpointEncodingV2<'a, ReplayTombstones, SessionCheckpoint> {
    pub(crate) context: &'a EditorContext,
    pub(crate) session_id: &'a str,
    pub(crate) checkpoint_log_id: &'a str,
    pub(crate) successor_log_id: &'a str,
    pub(crate) covered_through: Option<DecimalU64Record>,
    pub(crate) replay_tombstones: ReplayTombstones,
    pub(crate) session_checkpoint: SessionCheckpoint,
}

impl<ReplayTombstones, SessionCheckpoint> Serialize
    for LocalLogCheckpointEncodingV2<'_, ReplayTombstones, SessionCheckpoint>
where
    ReplayTombstones: Serialize,
    SessionCheckpoint: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("LocalLogCheckpointRecordV2", 10)?;
        record.serialize_field("format", LOCAL_LOG_CHECKPOINT_FORMAT)?;
        record.serialize_field("formatVersion", &LOCAL_LOG_CHECKPOINT_V2_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.context.schema().id(), self.context.schema().fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("sessionId", self.session_id)?;
        record.serialize_field("checkpointLogId", self.checkpoint_log_id)?;
        record.serialize_field("successorLogId", self.successor_log_id)?;
        record.serialize_field("coveredThrough", &self.covered_through)?;
        record.serialize_field("replayTombstones", &self.replay_tombstones)?;
        record.serialize_field("sessionCheckpoint", &self.session_checkpoint)?;
        record.end()
    }
}
