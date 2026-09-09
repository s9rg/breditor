//! Property-preserving records nested inside Session Checkpoint V3.

use serde::Serialize;

use crate::record::{PendingFormatRecordV2, SelectionRecordV1};

/// One chronological V3 history recipe.
///
/// Result documents and inverse operations remain derived by replay. Only the
/// exact forward recipe and post-transaction editor values cross the durable
/// boundary.
#[derive(Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct SessionHistoryEntryRecordV2<ForwardOperations> {
    pub(crate) forward_operations: ForwardOperations,
    pub(crate) result_selection: Option<SelectionRecordV1>,
    pub(crate) result_pending_formats: Option<Vec<PendingFormatRecordV2>>,
}
