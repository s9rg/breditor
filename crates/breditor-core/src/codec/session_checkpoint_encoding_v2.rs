use serde::{Serialize, ser::SerializeStruct};

use crate::{record::DecimalU64Record, state::EditorContext};

use super::{
    editor_state_encoding_v2::EditorStateEncodingV2,
    schema_binding_encoding::SchemaBindingEncoding,
    session_checkpoint_json::SESSION_CHECKPOINT_FORMAT,
    session_checkpoint_json_v2::SESSION_CHECKPOINT_V2_FORMAT_VERSION,
};

/// Borrowed deterministic encoding of one bounded session as Session Checkpoint V2.
pub(crate) struct SessionCheckpointEncodingV2<'a, E> {
    pub(crate) context: &'a EditorContext,
    pub(crate) history_base: EditorStateEncodingV2<'a>,
    pub(crate) current_revision: DecimalU64Record,
    pub(crate) history_capacity: u32,
    pub(crate) cursor: u32,
    pub(crate) entries: E,
    pub(crate) open_merge_group: Option<String>,
}

impl<E> Serialize for SessionCheckpointEncodingV2<'_, E>
where
    E: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("SessionCheckpointRecordV2", 11)?;
        record.serialize_field("format", SESSION_CHECKPOINT_FORMAT)?;
        record.serialize_field("formatVersion", &SESSION_CHECKPOINT_V2_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(self.context.schema().id(), self.context.schema().fingerprint())
            .serialize_fields(&mut record)?;
        record.serialize_field("historyBase", &self.history_base)?;
        record.serialize_field("currentRevision", &self.current_revision)?;
        record.serialize_field("historyCapacity", &self.history_capacity)?;
        record.serialize_field("cursor", &self.cursor)?;
        record.serialize_field("entries", &self.entries)?;
        record.serialize_field("openMergeGroup", &self.open_merge_group)?;
        record.end()
    }
}
