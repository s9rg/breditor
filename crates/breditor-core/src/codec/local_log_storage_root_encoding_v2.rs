use serde::{Serialize, ser::SerializeStruct};

use crate::record::DecimalU64Record;

use super::{
    LOCAL_LOG_STORAGE_ROOT_FORMAT, LOCAL_LOG_STORAGE_ROOT_V2_FORMAT_VERSION,
    LocalLogStorageRootSelection, schema_binding_encoding::SchemaBindingEncoding,
};

/// Borrowed canonical Storage Root V2 encoding.
pub(crate) struct LocalLogStorageRootEncodingV2<'a> {
    value: &'a LocalLogStorageRootSelection,
}

impl<'a> LocalLogStorageRootEncodingV2<'a> {
    pub(crate) const fn new(value: &'a LocalLogStorageRootSelection) -> Self {
        Self { value }
    }
}

impl Serialize for LocalLogStorageRootEncodingV2<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let value = self.value;
        let mut record = serializer.serialize_struct("LocalLogStorageRootRecordV2", 15)?;
        record.serialize_field("format", LOCAL_LOG_STORAGE_ROOT_FORMAT)?;
        record.serialize_field("formatVersion", &LOCAL_LOG_STORAGE_ROOT_V2_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(
            value.schema_binding().schema(),
            value.schema_binding().fingerprint(),
        )
        .serialize_fields(&mut record)?;
        record.serialize_field("profileId", value.profile_id().as_str())?;
        record.serialize_field("profileVersion", &value.profile_version().get())?;
        record.serialize_field("scopeId", value.scope_id().as_str())?;
        record.serialize_field("transactionId", value.transaction_id().as_str())?;
        record.serialize_field("committedHeadId", value.committed_head_id().as_str())?;
        record.serialize_field("fenceId", value.fence_id().as_str())?;
        record.serialize_field("sessionId", value.session_id().as_str())?;
        record.serialize_field("checkpointLogId", value.checkpoint_log_id().as_str())?;
        record.serialize_field("activeLogId", value.active_log_id().as_str())?;
        let frame = value
            .active_frame_v2()
            .ok_or_else(|| serde::ser::Error::custom("storage root is not Frame V2"))?;
        record
            .serialize_field("activeFrame", &FramePolicyV2(frame.limits().max_payload_bytes()))?;
        record.serialize_field("checkpointJson", value.checkpoint_json())?;
        record.end()
    }
}

struct FramePolicyV2(u64);

impl Serialize for FramePolicyV2 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut record = serializer.serialize_struct("LocalLogStorageGenerationFrameV2", 2)?;
        record.serialize_field("formatVersion", &2_u32)?;
        record.serialize_field("maxPayloadBytes", &DecimalU64Record::new(self.0))?;
        record.end()
    }
}
