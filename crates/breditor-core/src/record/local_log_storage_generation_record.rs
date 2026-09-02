use serde::Serialize;

use crate::record::DecimalU64Record;

/// Stable identifier for a storage-generation rotation manifest.
pub(crate) const LOCAL_LOG_STORAGE_GENERATION_FORMAT: &str =
    "breditor/local-log-storage-generation";

/// Storage-generation validation wire version implemented by this record.
pub(crate) const LOCAL_LOG_STORAGE_GENERATION_FORMAT_VERSION: u32 = 1;

/// Canonical nested Local Log Frame V1 policy record.
#[derive(Clone, Copy, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct LocalLogStorageGenerationFrameRecordV1 {
    pub(crate) format_version: u32,
    pub(crate) max_payload_bytes: DecimalU64Record,
}

/// Borrowed canonical encoding record for one complete rotation manifest.
///
/// This type intentionally does not implement `Deserialize`; untrusted fields
/// pass through borrowed strict boundaries before checked reconstruction.
#[derive(Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct LocalLogStorageGenerationRecordV1<'a> {
    pub(crate) format: &'static str,
    pub(crate) format_version: u32,
    pub(crate) profile_id: &'a str,
    pub(crate) profile_version: u32,
    pub(crate) scope_id: &'a str,
    pub(crate) transaction_id: &'a str,
    pub(crate) expected_head_id: &'a str,
    pub(crate) committed_head_id: &'a str,
    pub(crate) fence_id: &'a str,
    pub(crate) session_id: &'a str,
    pub(crate) sealed_log_id: &'a str,
    pub(crate) successor_log_id: &'a str,
    pub(crate) accepted_prefix_bytes: DecimalU64Record,
    pub(crate) sealed_frame: LocalLogStorageGenerationFrameRecordV1,
    pub(crate) successor_frame: LocalLogStorageGenerationFrameRecordV1,
    pub(crate) checkpoint_json: &'a str,
}
