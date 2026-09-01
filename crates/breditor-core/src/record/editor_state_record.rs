use serde::Serialize;

use crate::record::{PendingFormatRecordV1, SelectionRecordV1, SnapshotIdRecordV1};

/// Stable identifier for Breditor's complete editor-state checkpoint envelope.
pub(crate) const EDITOR_STATE_FORMAT: &str = "breditor/editor-state";

/// Editor-state checkpoint wire version implemented by this record.
pub(crate) const EDITOR_STATE_FORMAT_VERSION: u32 = 1;

/// Owned small fields plus a generic embedded Document V1 encoding.
///
/// This type intentionally does not implement `Deserialize`; untrusted nested
/// documents and state values pass through separate borrowed strict boundaries.
#[derive(Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct EditorStateRecordV1<Document> {
    pub(crate) format: String,
    pub(crate) format_version: u32,
    pub(crate) snapshot: SnapshotIdRecordV1,
    pub(crate) document: Document,
    pub(crate) selection: Option<SelectionRecordV1>,
    pub(crate) pending_formats: Option<Vec<PendingFormatRecordV1>>,
}
