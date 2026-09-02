use serde::Serialize;

use crate::record::LocalLogStorageGenerationFrameRecordV1;

/// Stable identifier for an initial local-log storage-root selection.
pub(crate) const LOCAL_LOG_STORAGE_ROOT_FORMAT: &str = "breditor/local-log-storage-root";

/// Storage-root validation wire version implemented by this record.
pub(crate) const LOCAL_LOG_STORAGE_ROOT_FORMAT_VERSION: u32 = 1;

/// Borrowed canonical encoding record for one complete initial root selection.
///
/// This type intentionally does not implement `Deserialize`; untrusted fields
/// pass through borrowed strict boundaries before checked reconstruction.
#[derive(Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct LocalLogStorageRootRecordV1<'a> {
    pub(crate) format: &'static str,
    pub(crate) format_version: u32,
    pub(crate) profile_id: &'a str,
    pub(crate) profile_version: u32,
    pub(crate) scope_id: &'a str,
    pub(crate) transaction_id: &'a str,
    pub(crate) committed_head_id: &'a str,
    pub(crate) fence_id: &'a str,
    pub(crate) session_id: &'a str,
    pub(crate) checkpoint_log_id: &'a str,
    pub(crate) active_log_id: &'a str,
    pub(crate) active_frame: LocalLogStorageGenerationFrameRecordV1,
    pub(crate) checkpoint_json: &'a str,
}
