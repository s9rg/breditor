use serde::{Serialize, ser::SerializeStruct};

use crate::{
    local_log::LocalLogEntry,
    record::{DecimalU64Record, LocalLogEventRecordV1},
};

use super::{
    local_log_entry_json::LOCAL_LOG_ENTRY_FORMAT,
    local_log_entry_json_v2::LOCAL_LOG_ENTRY_V2_FORMAT_VERSION,
    schema_binding_encoding::SchemaBindingEncoding,
};

/// Borrowed deterministic outer encoding of one Local Log Entry V2 value.
pub(crate) struct LocalLogEntryEncodingV2<'a, Commit> {
    pub(crate) entry: &'a LocalLogEntry,
    pub(crate) event: LocalLogEventRecordV1<Commit>,
}

impl<Commit> Serialize for LocalLogEntryEncodingV2<'_, Commit>
where
    Commit: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("LocalLogEntryRecordV2", 9)?;
        record.serialize_field("format", LOCAL_LOG_ENTRY_FORMAT)?;
        record.serialize_field("formatVersion", &LOCAL_LOG_ENTRY_V2_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(
            self.entry.schema_binding().schema(),
            self.entry.schema_binding().fingerprint(),
        )
        .serialize_fields(&mut record)?;
        record.serialize_field("sessionId", self.entry.session_id().as_str())?;
        record.serialize_field("logId", self.entry.log_id().as_str())?;
        record.serialize_field("sequence", &DecimalU64Record::new(self.entry.sequence().get()))?;
        record.serialize_field("replayId", self.entry.replay_id().as_str())?;
        record.serialize_field("event", &self.event)?;
        record.end()
    }
}
