use serde::Serialize;

use crate::record::{PendingFormatRecordV1, SelectionRecordV1, TransactionMetadataRecordV1};

/// Stable identifier for Breditor's durable commit envelope.
pub(crate) const COMMIT_FORMAT: &str = "breditor/commit";

/// Durable commit wire version implemented by this record.
pub(crate) const COMMIT_FORMAT_VERSION: u32 = 1;

/// Generic V1 encoding record for one proved editor-state transition.
///
/// This type intentionally does not implement `Deserialize`; untrusted
/// checkpoints and operation arrays pass through separate borrowed strict
/// boundaries before checked reconstruction.
#[derive(Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct CommitRecordV1<Before, ForwardOperations> {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    pub(crate) before: Before,
    pub(crate) forward_operations: ForwardOperations,
    pub(crate) result_selection: Option<SelectionRecordV1>,
    pub(crate) result_pending_formats: Option<Vec<PendingFormatRecordV1>>,
    pub(crate) metadata: TransactionMetadataRecordV1,
}
