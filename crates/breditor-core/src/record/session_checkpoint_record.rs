use serde::Serialize;

use crate::record::{DecimalU64Record, PendingFormatRecordV1, SelectionRecordV1};

/// Stable identifier for Breditor's durable session-checkpoint envelope.
pub(crate) const SESSION_CHECKPOINT_FORMAT: &str = "breditor/session-checkpoint";

/// Durable session-checkpoint wire version implemented by this record.
pub(crate) const SESSION_CHECKPOINT_FORMAT_VERSION: u32 = 1;

/// Generic V1 encoding record for one bounded linear-history session.
///
/// This type intentionally does not implement `Deserialize`; untrusted nested
/// state and entry values pass through borrowed strict boundaries before
/// checked reconstruction.
#[derive(Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct SessionCheckpointRecordV1<HistoryBase, Entries> {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    pub(crate) history_base: HistoryBase,
    pub(crate) current_revision: DecimalU64Record,
    pub(crate) history_capacity: u32,
    pub(crate) cursor: u32,
    pub(crate) entries: Entries,
    pub(crate) open_merge_group: Option<String>,
}

/// Generic V1 encoding record for one chronological history entry.
///
/// The result document and inverse operations are derived by replaying the
/// forward recipe from the preceding chronological boundary.
#[derive(Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct SessionHistoryEntryRecordV1<ForwardOperations> {
    pub(crate) forward_operations: ForwardOperations,
    pub(crate) result_selection: Option<SelectionRecordV1>,
    pub(crate) result_pending_formats: Option<Vec<PendingFormatRecordV1>>,
}
