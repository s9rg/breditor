use serde::{Serialize, ser::SerializeStruct};

use crate::record::DecimalU64Record;

use super::{
    LOCAL_LOG_STORAGE_GENERATION_FORMAT, LOCAL_LOG_STORAGE_GENERATION_V2_FORMAT_VERSION,
    LocalLogStorageGenerationManifest, schema_binding_encoding::SchemaBindingEncoding,
};

/// Borrowed canonical Storage Generation V2 encoding.
pub(crate) struct LocalLogStorageGenerationEncodingV2<'a> {
    value: &'a LocalLogStorageGenerationManifest,
}

impl<'a> LocalLogStorageGenerationEncodingV2<'a> {
    pub(crate) const fn new(value: &'a LocalLogStorageGenerationManifest) -> Self {
        Self { value }
    }
}

impl Serialize for LocalLogStorageGenerationEncodingV2<'_> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let value = self.value;
        let mut record = serializer.serialize_struct("LocalLogStorageGenerationRecordV2", 18)?;
        record.serialize_field("format", LOCAL_LOG_STORAGE_GENERATION_FORMAT)?;
        record.serialize_field("formatVersion", &LOCAL_LOG_STORAGE_GENERATION_V2_FORMAT_VERSION)?;
        SchemaBindingEncoding::new(
            value.schema_binding().schema(),
            value.schema_binding().fingerprint(),
        )
        .serialize_fields(&mut record)?;
        record.serialize_field("profileId", value.profile_id().as_str())?;
        record.serialize_field("profileVersion", &value.profile_version().get())?;
        record.serialize_field("scopeId", value.scope_id().as_str())?;
        record.serialize_field("transactionId", value.transaction_id().as_str())?;
        record.serialize_field("expectedHeadId", value.expected_head_id().as_str())?;
        record.serialize_field("committedHeadId", value.committed_head_id().as_str())?;
        record.serialize_field("fenceId", value.fence_id().as_str())?;
        record.serialize_field("sessionId", value.session_id().as_str())?;
        record.serialize_field("sealedLogId", value.sealed_log_id().as_str())?;
        record.serialize_field("successorLogId", value.successor_log_id().as_str())?;
        record.serialize_field(
            "acceptedPrefixBytes",
            &DecimalU64Record::new(value.accepted_prefix_bytes()),
        )?;
        let sealed = value
            .sealed_frame_v2()
            .ok_or_else(|| serde::ser::Error::custom("sealed generation is not Frame V2"))?;
        let successor = value
            .successor_frame_v2()
            .ok_or_else(|| serde::ser::Error::custom("successor generation is not Frame V2"))?;
        record
            .serialize_field("sealedFrame", &FramePolicyV2(sealed.limits().max_payload_bytes()))?;
        record.serialize_field(
            "successorFrame",
            &FramePolicyV2(successor.limits().max_payload_bytes()),
        )?;
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
